"""Pydantic models for all collections."""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


# ─── Shared ────────────────────────────────────────────────────────────────────
class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        return str(v)


# ─── Auth ──────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── Users ─────────────────────────────────────────────────────────────────────
class UserUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


# ─── Workspaces ────────────────────────────────────────────────────────────────
class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = None


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: str = "member"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("owner", "admin", "member"):
            raise ValueError("Role must be owner, admin, or member")
        return v


class UpdateMemberRoleRequest(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("admin", "member"):
            raise ValueError("Role must be admin or member")
        return v


# ─── Projects ──────────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    workspace_id: str
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = None
    stack: List[str] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    stack: Optional[List[str]] = None
    status: Optional[str] = None


# ─── Conversations ─────────────────────────────────────────────────────────────
class ConversationCreate(BaseModel):
    workspace_id: str
    project_id: Optional[str] = None
    title: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    project_id: Optional[str] = None


# ─── Memories ──────────────────────────────────────────────────────────────────
class MemoryType(str, Enum):
    fact = "fact"
    preference = "preference"
    decision = "decision"
    constraint = "constraint"
    task = "task"
    architecture = "architecture"
    responsibility = "responsibility"
    bug_solution = "bug_solution"
    feedback = "feedback"
    lesson = "lesson"
    summary = "summary"
    outcome = "outcome"


class PrivacyScope(str, Enum):
    personal = "personal"
    project = "project"
    workspace = "workspace"


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    memory_type: MemoryType = MemoryType.fact
    project_id: Optional[str] = None
    privacy_scope: PrivacyScope = PrivacyScope.workspace
    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    expires_at: Optional[datetime] = None
    source: Optional[str] = None


class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    memory_type: Optional[MemoryType] = None
    importance: Optional[float] = None
    privacy_scope: Optional[PrivacyScope] = None
    expires_at: Optional[datetime] = None


class MemoryCorrection(BaseModel):
    corrected_content: str
    reason: Optional[str] = None


class MemorySearchRequest(BaseModel):
    query: str
    workspace_id: str
    project_id: Optional[str] = None
    memory_type: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=50)


# ─── Decisions ─────────────────────────────────────────────────────────────────
class DecisionStatus(str, Enum):
    proposed = "proposed"
    approved = "approved"
    rejected = "rejected"
    superseded = "superseded"


class DecisionCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = None
    reasoning: Optional[str] = None
    alternatives: Optional[List[dict]] = []
    project_id: Optional[str] = None
    workspace_id: str


class DecisionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    reasoning: Optional[str] = None
    alternatives: Optional[List[dict]] = None
    status: Optional[DecisionStatus] = None


# ─── Tasks ─────────────────────────────────────────────────────────────────────
class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    review = "review"
    completed = "completed"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = None
    workspace_id: str
    project_id: Optional[str] = None
    assignee_id: Optional[str] = None
    priority: TaskPriority = TaskPriority.medium
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    assignee_id: Optional[str] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None


class TaskComment(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
