from fastapi import APIRouter, Depends, HTTPException, Query
from app.security import get_current_user
from app.database import get_db
from app.models.schemas import MemoryCreate, MemoryUpdate, MemoryCorrection, MemorySearchRequest
from app.services.memory_service import (
    create_memory, get_memory, update_memory, delete_memory,
    semantic_search, get_memories_list,
)
from app.services.activity_service import log_activity
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter(prefix="/memories", tags=["memories"])


async def _check_member(db, workspace_id: str, user_id: str):
    member = await db.workspace_members.find_one({"workspace_id": workspace_id, "user_id": user_id})
    if not member:
        raise HTTPException(403, "Not a member of this workspace")
    return member


@router.post("", status_code=201)
async def add_memory(
    body: MemoryCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    workspace_id = body.project_id and (await db.projects.find_one({"_id": ObjectId(body.project_id)}))
    # Get workspace_id from the request
    # We need workspace_id - client must pass it
    raise HTTPException(400, "Use POST /workspaces/{id}/memories instead")


@router.post("/workspace/{workspace_id}", status_code=201)
async def create_workspace_memory(
    workspace_id: str,
    body: MemoryCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    memory_data = {
        **body.model_dump(),
        "user_id": str(current_user["_id"]),
        "workspace_id": workspace_id,
    }
    result = await create_memory(db, memory_data)
    await log_activity(db, workspace_id, str(current_user["_id"]), "memory_created", body.content[:60])
    return result


@router.get("/workspace/{workspace_id}")
async def list_memories(
    workspace_id: str,
    project_id: str = Query(None),
    memory_type: str = Query(None),
    privacy_scope: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    memories, total = await get_memories_list(
        db=db,
        workspace_id=workspace_id,
        user_id=str(current_user["_id"]),
        project_id=project_id,
        memory_type=memory_type,
        privacy_scope=privacy_scope,
        skip=skip,
        limit=limit,
    )
    # Enrich with user names
    for m in memories:
        if m.get("user_id"):
            user = await db.users.find_one({"_id": ObjectId(m["user_id"])})
            m["owner_name"] = user.get("name", "Unknown") if user else "Unknown"
    return {"memories": memories, "total": total, "skip": skip, "limit": limit}


@router.post("/search")
async def search_memories(
    body: MemorySearchRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, body.workspace_id, str(current_user["_id"]))
    results = await semantic_search(
        db=db,
        query=body.query,
        workspace_id=body.workspace_id,
        user_id=str(current_user["_id"]),
        project_id=body.project_id,
        memory_type=body.memory_type,
        limit=body.limit,
    )
    return {"results": results, "count": len(results)}


@router.get("/{memory_id}")
async def get_single_memory(
    memory_id: str,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    memory = await get_memory(db, memory_id, str(current_user["_id"]), workspace_id)
    if not memory:
        raise HTTPException(404, "Memory not found")
    return memory


@router.patch("/{memory_id}")
async def update_single_memory(
    memory_id: str,
    body: MemoryUpdate,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await update_memory(db, memory_id, updates, str(current_user["_id"]))
    if not result:
        raise HTTPException(404, "Memory not found")
    await log_activity(db, workspace_id, str(current_user["_id"]), "memory_updated", result.get("content", "")[:60])
    return result


@router.post("/{memory_id}/correct")
async def correct_memory(
    memory_id: str,
    body: MemoryCorrection,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    updates = {
        "content": body.corrected_content,
        "correction_reason": body.reason,
        "corrected_by": str(current_user["_id"]),
        "corrected_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await update_memory(db, memory_id, updates, str(current_user["_id"]))
    if not result:
        raise HTTPException(404, "Memory not found")
    await log_activity(db, workspace_id, str(current_user["_id"]), "memory_corrected", body.corrected_content[:60])
    return result


@router.delete("/{memory_id}", status_code=204)
async def delete_single_memory(
    memory_id: str,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    success = await delete_memory(db, memory_id)
    if not success:
        raise HTTPException(404, "Memory not found")
    await log_activity(db, workspace_id, str(current_user["_id"]), "memory_deleted", memory_id)


@router.post("/{memory_id}/feedback")
async def submit_feedback(
    memory_id: str,
    feedback: dict,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await db.memory_feedback.insert_one({
        "memory_id": memory_id,
        "user_id": str(current_user["_id"]),
        "workspace_id": workspace_id,
        "rating": feedback.get("rating"),
        "comment": feedback.get("comment", ""),
        "created_at": datetime.now(timezone.utc),
    })
    return {"message": "Feedback recorded"}


@router.get("/workspace/{workspace_id}/stats")
async def memory_stats(
    workspace_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    total = await db.memories.count_documents({"workspace_id": workspace_id, "status": "active"})
    by_type = {}
    for t in ["fact", "preference", "decision", "constraint", "task", "lesson", "architecture", "responsibility"]:
        by_type[t] = await db.memories.count_documents({"workspace_id": workspace_id, "status": "active", "memory_type": t})
    from datetime import timedelta
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent = await db.memories.count_documents({
        "workspace_id": workspace_id, "status": "active",
        "created_at": {"$gte": week_ago},
    })
    return {"total": total, "by_type": by_type, "recent_7_days": recent}
