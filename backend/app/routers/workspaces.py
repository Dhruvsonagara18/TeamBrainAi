from fastapi import APIRouter, Depends, HTTPException, Query
from app.security import get_current_user
from app.database import get_db
from app.models.schemas import WorkspaceCreate, WorkspaceUpdate, InviteMemberRequest, UpdateMemberRoleRequest
from app.services.activity_service import log_activity
from bson import ObjectId
from datetime import datetime, timezone
import re
import secrets

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:50]


def _ws_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "slug": doc.get("slug", ""),
        "description": doc.get("description", ""),
        "owner_id": doc.get("owner_id", ""),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat(),
    }


@router.post("", status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    slug = _slugify(body.name)
    # ensure unique slug
    existing = await db.workspaces.find_one({"slug": slug})
    if existing:
        slug = f"{slug}-{secrets.token_hex(3)}"
    now = datetime.now(timezone.utc)
    doc = {
        "name": body.name,
        "slug": slug,
        "description": body.description or "",
        "owner_id": str(current_user["_id"]),
        "created_at": now,
        "updated_at": now,
    }
    result = await db.workspaces.insert_one(doc)
    ws_id = str(result.inserted_id)
    # Add owner as member
    await db.workspace_members.insert_one({
        "workspace_id": ws_id,
        "user_id": str(current_user["_id"]),
        "role": "owner",
        "joined_at": now,
    })
    doc["_id"] = result.inserted_id
    return _ws_out(doc)


@router.get("")
async def list_workspaces(current_user=Depends(get_current_user), db=Depends(get_db)):
    if db is None:
        raise HTTPException(503, "Database not configured")
    memberships = await db.workspace_members.find(
        {"user_id": str(current_user["_id"])}
    ).to_list(100)
    ws_ids = [ObjectId(m["workspace_id"]) for m in memberships]
    workspaces = await db.workspaces.find({"_id": {"$in": ws_ids}}).to_list(100)
    if not workspaces:
        now = datetime.now(timezone.utc)
        user_name = current_user.get("name", "Team")
        slug = _slugify(f"{user_name} Workspace")
        ws_doc = {
            "name": f"{user_name}'s Workspace",
            "slug": f"{slug}-{secrets.token_hex(2)}",
            "description": "Primary workspace",
            "owner_id": str(current_user["_id"]),
            "created_at": now,
            "updated_at": now,
        }
        res = await db.workspaces.insert_one(ws_doc)
        ws_doc["_id"] = res.inserted_id
        await db.workspace_members.insert_one({
            "workspace_id": str(res.inserted_id),
            "user_id": str(current_user["_id"]),
            "role": "owner",
            "joined_at": now,
        })
        workspaces = [ws_doc]
        memberships = [{"workspace_id": str(res.inserted_id), "role": "owner"}]

    result = []
    for ws in workspaces:
        out = _ws_out(ws)
        membership = next((m for m in memberships if m["workspace_id"] == str(ws["_id"])), None)
        out["role"] = membership["role"] if membership else "member"
        # Count members & projects
        out["member_count"] = await db.workspace_members.count_documents({"workspace_id": str(ws["_id"])})
        out["project_count"] = await db.projects.count_documents({"workspace_id": str(ws["_id"])})
        result.append(out)
    return result


@router.get("/{workspace_id}")
async def get_workspace(
    workspace_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    ws = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    if not ws:
        raise HTTPException(404, "Workspace not found")
    member = await db.workspace_members.find_one(
        {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
    )
    if not member:
        raise HTTPException(403, "Not a member of this workspace")
    out = _ws_out(ws)
    out["role"] = member["role"]
    out["member_count"] = await db.workspace_members.count_documents({"workspace_id": workspace_id})
    out["project_count"] = await db.projects.count_documents({"workspace_id": workspace_id})
    out["memory_count"] = await db.memories.count_documents({"workspace_id": workspace_id, "status": "active"})
    return out


@router.patch("/{workspace_id}")
async def update_workspace(
    workspace_id: str,
    body: WorkspaceUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    member = await db.workspace_members.find_one(
        {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
    )
    if not member or member["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Insufficient permissions")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.workspaces.update_one({"_id": ObjectId(workspace_id)}, {"$set": updates})
    ws = await db.workspaces.find_one({"_id": ObjectId(workspace_id)})
    return _ws_out(ws)


@router.get("/{workspace_id}/members")
async def list_members(
    workspace_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    member_check = await db.workspace_members.find_one(
        {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
    )
    if not member_check:
        raise HTTPException(403, "Not a member")
    members = await db.workspace_members.find({"workspace_id": workspace_id}).to_list(200)
    result = []
    for m in members:
        user = await db.users.find_one({"_id": ObjectId(m["user_id"])})
        if user:
            result.append({
                "user_id": m["user_id"],
                "name": user.get("name", ""),
                "email": user.get("email", ""),
                "role": m.get("role", "member"),
                "joined_at": m.get("joined_at", datetime.now(timezone.utc)).isoformat(),
            })
    return result


@router.post("/{workspace_id}/invite")
async def invite_member(
    workspace_id: str,
    body: InviteMemberRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    member_check = await db.workspace_members.find_one(
        {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
    )
    if not member_check or member_check["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Insufficient permissions")
    # Check if user exists
    invited_user = await db.users.find_one({"email": body.email.lower()})
    if invited_user:
        existing = await db.workspace_members.find_one(
            {"workspace_id": workspace_id, "user_id": str(invited_user["_id"])}
        )
        if existing:
            raise HTTPException(400, "User is already a member")
        await db.workspace_members.insert_one({
            "workspace_id": workspace_id,
            "user_id": str(invited_user["_id"]),
            "role": body.role,
            "joined_at": datetime.now(timezone.utc),
        })
        await log_activity(db, workspace_id, str(current_user["_id"]), "member_added",
                           f"Added {invited_user.get('name', body.email)}")
        return {"message": "Member added successfully", "user_found": True}
    # User not found — create invite token
    token = secrets.token_urlsafe(32)
    await db.invitations.insert_one({
        "workspace_id": workspace_id,
        "email": body.email.lower(),
        "role": body.role,
        "token": token,
        "invited_by": str(current_user["_id"]),
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc).replace(hour=23, minute=59),
    })
    return {"message": "Invitation created. User must register and accept.", "user_found": False, "token": token}


@router.delete("/{workspace_id}/members/{user_id}")
async def remove_member(
    workspace_id: str,
    user_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    member_check = await db.workspace_members.find_one(
        {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
    )
    if not member_check or member_check["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Insufficient permissions")
    if user_id == str(current_user["_id"]):
        raise HTTPException(400, "Cannot remove yourself")
    await db.workspace_members.delete_one({"workspace_id": workspace_id, "user_id": user_id})
    return {"message": "Member removed"}


@router.get("/{workspace_id}/activity")
async def get_activity(
    workspace_id: str,
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    member_check = await db.workspace_members.find_one(
        {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
    )
    if not member_check:
        raise HTTPException(403, "Not a member")
    logs = await db.activity_logs.find(
        {"workspace_id": workspace_id}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    result = []
    for log in logs:
        user = await db.users.find_one({"_id": ObjectId(log["user_id"])})
        result.append({
            "id": str(log["_id"]),
            "action": log.get("action", ""),
            "detail": log.get("detail", ""),
            "user_name": user.get("name", "Unknown") if user else "Unknown",
            "created_at": log.get("created_at", datetime.now(timezone.utc)).isoformat(),
        })
    return result
