from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest
from app.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token, get_current_user
from app.database import get_db
from app.services.activity_service import log_activity
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "avatar_url": user.get("avatar_url"),
        "bio": user.get("bio", ""),
        "created_at": user.get("created_at", datetime.now(timezone.utc)).isoformat(),
    }


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db=Depends(get_db)):
    if db is None:
        raise HTTPException(503, "Database not configured")
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    now = datetime.now(timezone.utc)
    doc = {
        "name": body.name,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "avatar_url": None,
        "bio": "",
        "settings": {
            "theme": "dark",
            "memory_extraction": True,
            "shared_memories": True,
        },
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    user_id_str = str(result.inserted_id)

    # Auto-provision a default workspace
    import re, secrets
    ws_name = f"{body.name}'s Workspace"
    ws_slug = re.sub(r"[^a-z0-9]+", "-", ws_name.lower()).strip("-")[:45]
    if await db.workspaces.find_one({"slug": ws_slug}):
        ws_slug = f"{ws_slug}-{secrets.token_hex(2)}"
    ws_doc = {
        "name": ws_name,
        "slug": ws_slug,
        "description": "Default workspace for team collaboration and persistent memory",
        "owner_id": user_id_str,
        "created_at": now,
        "updated_at": now,
    }
    ws_res = await db.workspaces.insert_one(ws_doc)
    await db.workspace_members.insert_one({
        "workspace_id": str(ws_res.inserted_id),
        "user_id": user_id_str,
        "role": "owner",
        "joined_at": now,
    })

    token_data = {"sub": user_id_str}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": _user_out(doc),
    }


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db=Depends(get_db)):
    if db is None:
        raise HTTPException(503, "Database not configured")
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token_data = {"sub": str(user["_id"])}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": _user_out(user),
    }


@router.post("/refresh")
async def refresh_token(body: RefreshRequest, db=Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid refresh token")
    user_id = payload.get("sub")
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(401, "User not found")
    token_data = {"sub": user_id}
    return {
        "access_token": create_access_token(token_data),
        "refresh_token": create_refresh_token(token_data),
        "token_type": "bearer",
        "user": _user_out(user),
    }


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    return _user_out(current_user)
