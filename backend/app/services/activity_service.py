"""Minimal activity logging helper."""
from datetime import datetime, timezone


async def log_activity(db, workspace_id: str, user_id: str, action: str, detail: str = ""):
    if db is None:
        return
    await db.activity_logs.insert_one({
        "workspace_id": workspace_id,
        "user_id": user_id,
        "action": action,
        "detail": detail,
        "created_at": datetime.now(timezone.utc),
    })
