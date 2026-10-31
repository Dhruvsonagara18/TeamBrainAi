from fastapi import APIRouter, Depends, HTTPException
from app.security import get_current_user
from app.database import get_db
from app.models.schemas import UserUpdate, PasswordChange
from app.security import verify_password, hash_password
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["users"])


def _user_out(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "avatar_url": user.get("avatar_url"),
        "bio": user.get("bio", ""),
        "settings": user.get("settings", {}),
        "created_at": user.get("created_at", datetime.now(timezone.utc)).isoformat(),
    }


@router.get("/me")
async def get_profile(current_user=Depends(get_current_user)):
    return _user_out(current_user)


@router.patch("/me")
async def update_profile(
    body: UserUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return _user_out(current_user)
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.users.update_one({"_id": current_user["_id"]}, {"$set": updates})
    updated = await db.users.find_one({"_id": current_user["_id"]})
    return _user_out(updated)


@router.post("/me/change-password")
async def change_password(
    body: PasswordChange,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if not verify_password(body.current_password, current_user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Password updated successfully"}


@router.patch("/me/settings")
async def update_settings(
    settings_data: dict,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"settings": settings_data, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Settings updated"}
