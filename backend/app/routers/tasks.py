from fastapi import APIRouter, Depends, HTTPException, Query
from app.security import get_current_user
from app.database import get_db
from app.models.schemas import TaskCreate, TaskUpdate, TaskComment
from app.services.activity_service import log_activity
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _task_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "workspace_id": doc.get("workspace_id", ""),
        "project_id": doc.get("project_id"),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "status": doc.get("status", "todo"),
        "priority": doc.get("priority", "medium"),
        "assignee_id": doc.get("assignee_id"),
        "assignee_name": doc.get("assignee_name", ""),
        "due_date": doc.get("due_date").isoformat() if doc.get("due_date") else None,
        "comments": doc.get("comments", []),
        "created_by": doc.get("created_by", ""),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat(),
        "updated_at": doc.get("updated_at", datetime.now(timezone.utc)).isoformat(),
    }


async def _check_member(db, workspace_id: str, user_id: str):
    member = await db.workspace_members.find_one({"workspace_id": workspace_id, "user_id": user_id})
    if not member:
        raise HTTPException(403, "Not a member of this workspace")
    return member


@router.post("", status_code=201)
async def create_task(
    body: TaskCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, body.workspace_id, str(current_user["_id"]))

    assignee_name = ""
    if body.assignee_id:
        assignee = await db.users.find_one({"_id": ObjectId(body.assignee_id)})
        assignee_name = assignee.get("name", "") if assignee else ""

    now = datetime.now(timezone.utc)
    doc = {
        "workspace_id": body.workspace_id,
        "project_id": body.project_id,
        "title": body.title,
        "description": body.description or "",
        "status": "todo",
        "priority": body.priority,
        "assignee_id": body.assignee_id,
        "assignee_name": assignee_name,
        "due_date": body.due_date,
        "comments": [],
        "created_by": str(current_user["_id"]),
        "created_at": now,
        "updated_at": now,
    }
    result = await db.tasks.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_activity(db, body.workspace_id, str(current_user["_id"]), "task_created", body.title)
    return _task_out(doc)


@router.get("")
async def list_tasks(
    workspace_id: str = Query(...),
    project_id: str = Query(None),
    status: str = Query(None),
    assignee_id: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    query = {"workspace_id": workspace_id}
    if project_id:
        query["project_id"] = project_id
    if status:
        query["status"] = status
    if assignee_id:
        query["assignee_id"] = assignee_id
    total = await db.tasks.count_documents(query)
    tasks = await db.tasks.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"tasks": [_task_out(t) for t in tasks], "total": total}


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await _check_member(db, workspace_id, str(current_user["_id"]))
    t = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not t:
        raise HTTPException(404, "Task not found")
    return _task_out(t)


@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await _check_member(db, workspace_id, str(current_user["_id"]))
    t = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not t:
        raise HTTPException(404, "Task not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "assignee_id" in updates and updates["assignee_id"]:
        assignee = await db.users.find_one({"_id": ObjectId(updates["assignee_id"])})
        updates["assignee_name"] = assignee.get("name", "") if assignee else ""
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": updates})
    updated = await db.tasks.find_one({"_id": ObjectId(task_id)})
    await log_activity(db, workspace_id, str(current_user["_id"]), "task_updated", t.get("title", ""))
    return _task_out(updated)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: str,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await _check_member(db, workspace_id, str(current_user["_id"]))
    t = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not t:
        raise HTTPException(404, "Task not found")
    await db.tasks.delete_one({"_id": ObjectId(task_id)})
    await log_activity(db, workspace_id, str(current_user["_id"]), "task_deleted", t.get("title", ""))


@router.post("/{task_id}/comments")
async def add_comment(
    task_id: str,
    body: TaskComment,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await _check_member(db, workspace_id, str(current_user["_id"]))
    comment = {
        "id": str(ObjectId()),
        "user_id": str(current_user["_id"]),
        "user_name": current_user.get("name", ""),
        "content": body.content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$push": {"comments": comment}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    return comment


@router.get("/workspace/{workspace_id}/stats")
async def task_stats(
    workspace_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await _check_member(db, workspace_id, str(current_user["_id"]))
    total = await db.tasks.count_documents({"workspace_id": workspace_id})
    by_status = {}
    for s in ["todo", "in_progress", "review", "completed"]:
        by_status[s] = await db.tasks.count_documents({"workspace_id": workspace_id, "status": s})
    return {"total": total, "by_status": by_status}
