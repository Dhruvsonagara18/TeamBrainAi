from fastapi import APIRouter, Depends, HTTPException, Query
from app.security import get_current_user
from app.database import get_db
from app.models.schemas import ProjectCreate, ProjectUpdate
from app.services.activity_service import log_activity
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter(prefix="/projects", tags=["projects"])


def _proj_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "workspace_id": doc.get("workspace_id", ""),
        "name": doc.get("name", ""),
        "description": doc.get("description", ""),
        "stack": doc.get("stack", []),
        "status": doc.get("status", "active"),
        "progress": doc.get("progress", 0),
        "created_by": doc.get("created_by", ""),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat(),
        "updated_at": doc.get("updated_at", datetime.now(timezone.utc)).isoformat(),
    }


async def _check_member(db, workspace_id: str, user_id: str):
    member = await db.workspace_members.find_one(
        {"workspace_id": workspace_id, "user_id": user_id}
    )
    if not member:
        raise HTTPException(403, "Not a member of this workspace")
    return member


@router.post("", status_code=201)
async def create_project(
    body: ProjectCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, body.workspace_id, str(current_user["_id"]))
    now = datetime.now(timezone.utc)
    doc = {
        "workspace_id": body.workspace_id,
        "name": body.name,
        "description": body.description or "",
        "stack": body.stack,
        "status": "active",
        "progress": 0,
        "created_by": str(current_user["_id"]),
        "created_at": now,
        "updated_at": now,
    }
    result = await db.projects.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_activity(db, body.workspace_id, str(current_user["_id"]), "project_created", body.name)
    return _proj_out(doc)


@router.get("")
async def list_projects(
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, workspace_id, str(current_user["_id"]))
    projects = await db.projects.find({"workspace_id": workspace_id}).sort("created_at", -1).to_list(100)
    result = []
    for p in projects:
        out = _proj_out(p)
        out["memory_count"] = await db.memories.count_documents({"project_id": str(p["_id"]), "status": "active"})
        out["decision_count"] = await db.decisions.count_documents({"project_id": str(p["_id"])})
        out["task_count"] = await db.tasks.count_documents({"project_id": str(p["_id"])})
        # Get member details
        creator = await db.users.find_one({"_id": ObjectId(p["created_by"])}) if p.get("created_by") else None
        out["creator_name"] = creator.get("name", "Unknown") if creator else "Unknown"
        result.append(out)
    return result


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    p = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not p:
        raise HTTPException(404, "Project not found")
    await _check_member(db, p["workspace_id"], str(current_user["_id"]))
    out = _proj_out(p)
    out["memory_count"] = await db.memories.count_documents({"project_id": project_id, "status": "active"})
    out["decision_count"] = await db.decisions.count_documents({"project_id": project_id})
    out["task_count"] = await db.tasks.count_documents({"project_id": project_id})
    return out


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    p = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not p:
        raise HTTPException(404, "Project not found")
    member = await _check_member(db, p["workspace_id"], str(current_user["_id"]))
    if member["role"] == "member" and p["created_by"] != str(current_user["_id"]):
        raise HTTPException(403, "Only project creator or admin can update")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.projects.update_one({"_id": ObjectId(project_id)}, {"$set": updates})
    updated = await db.projects.find_one({"_id": ObjectId(project_id)})
    return _proj_out(updated)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    p = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not p:
        raise HTTPException(404, "Project not found")
    member = await _check_member(db, p["workspace_id"], str(current_user["_id"]))
    if member["role"] not in ("owner", "admin") and p["created_by"] != str(current_user["_id"]):
        raise HTTPException(403, "Insufficient permissions")
    await db.projects.delete_one({"_id": ObjectId(project_id)})
    await log_activity(db, p["workspace_id"], str(current_user["_id"]), "project_deleted", p.get("name", ""))
