from fastapi import APIRouter, Depends, HTTPException, Query
from app.security import get_current_user
from app.database import get_db
from app.models.schemas import DecisionCreate, DecisionUpdate, DecisionStatus
from app.services.ai_service import detect_conflicts
from app.services.activity_service import log_activity
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter(prefix="/decisions", tags=["decisions"])


def _dec_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "workspace_id": doc.get("workspace_id", ""),
        "project_id": doc.get("project_id"),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "reasoning": doc.get("reasoning", ""),
        "alternatives": doc.get("alternatives", []),
        "status": doc.get("status", "proposed"),
        "owner_id": doc.get("owner_id", ""),
        "owner_name": doc.get("owner_name", ""),
        "conflicts": doc.get("conflicts", []),
        "related_memories": doc.get("related_memories", []),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat(),
        "updated_at": doc.get("updated_at", datetime.now(timezone.utc)).isoformat(),
    }


async def _check_member(db, workspace_id: str, user_id: str):
    member = await db.workspace_members.find_one({"workspace_id": workspace_id, "user_id": user_id})
    if not member:
        raise HTTPException(403, "Not a member of this workspace")
    return member


@router.post("", status_code=201)
async def create_decision(
    body: DecisionCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_member(db, body.workspace_id, str(current_user["_id"]))

    # Conflict detection
    existing_decisions = await db.decisions.find(
        {"workspace_id": body.workspace_id, "status": "approved"}
    ).to_list(50)
    conflict_result = await detect_conflicts(
        f"{body.title}: {body.description or ''}",
        [{"title": d["title"], "description": d.get("description", ""), "status": d["status"]} for d in existing_decisions],
    )

    now = datetime.now(timezone.utc)
    user = current_user
    doc = {
        "workspace_id": body.workspace_id,
        "project_id": body.project_id,
        "title": body.title,
        "description": body.description or "",
        "reasoning": body.reasoning or "",
        "alternatives": body.alternatives or [],
        "status": "proposed",
        "owner_id": str(user["_id"]),
        "owner_name": user.get("name", ""),
        "conflicts": conflict_result.get("conflicts", []),
        "has_conflict": conflict_result.get("has_conflict", False),
        "related_memories": [],
        "history": [],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.decisions.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_activity(db, body.workspace_id, str(user["_id"]), "decision_created", body.title)
    out = _dec_out(doc)
    out["has_conflict"] = conflict_result.get("has_conflict", False)
    return out


@router.get("")
async def list_decisions(
    workspace_id: str = Query(...),
    project_id: str = Query(None),
    status: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
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
    total = await db.decisions.count_documents(query)
    decisions = await db.decisions.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {
        "decisions": [_dec_out(d) for d in decisions],
        "total": total,
    }


@router.get("/{decision_id}")
async def get_decision(
    decision_id: str,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await _check_member(db, workspace_id, str(current_user["_id"]))
    d = await db.decisions.find_one({"_id": ObjectId(decision_id)})
    if not d:
        raise HTTPException(404, "Decision not found")
    return _dec_out(d)


@router.patch("/{decision_id}")
async def update_decision(
    decision_id: str,
    body: DecisionUpdate,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await _check_member(db, workspace_id, str(current_user["_id"]))
    d = await db.decisions.find_one({"_id": ObjectId(decision_id)})
    if not d:
        raise HTTPException(404, "Decision not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    # Record history
    history_entry = {
        "status": d.get("status"),
        "changed_by": str(current_user["_id"]),
        "changed_at": datetime.now(timezone.utc).isoformat(),
    }
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.decisions.update_one(
        {"_id": ObjectId(decision_id)},
        {"$set": updates, "$push": {"history": history_entry}},
    )
    updated = await db.decisions.find_one({"_id": ObjectId(decision_id)})
    await log_activity(db, workspace_id, str(current_user["_id"]), "decision_updated", d.get("title", ""))
    return _dec_out(updated)


@router.post("/{decision_id}/approve")
async def approve_decision(
    decision_id: str,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    member = await _check_member(db, workspace_id, str(current_user["_id"]))
    if member["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Only admins can approve decisions")
    now = datetime.now(timezone.utc)
    history_entry = {
        "status": "approved",
        "changed_by": str(current_user["_id"]),
        "changed_at": now.isoformat(),
        "user_name": current_user.get("name", ""),
    }
    await db.decisions.update_one(
        {"_id": ObjectId(decision_id)},
        {"$set": {"status": "approved", "updated_at": now}, "$push": {"history": history_entry}},
    )
    d = await db.decisions.find_one({"_id": ObjectId(decision_id)})
    await log_activity(db, workspace_id, str(current_user["_id"]), "decision_approved", d.get("title", ""))
    return _dec_out(d)


@router.post("/{decision_id}/reject")
async def reject_decision(
    decision_id: str,
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    member = await _check_member(db, workspace_id, str(current_user["_id"]))
    if member["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Only admins can reject decisions")
    now = datetime.now(timezone.utc)
    history_entry = {
        "status": "rejected",
        "changed_by": str(current_user["_id"]),
        "changed_at": now.isoformat(),
    }
    await db.decisions.update_one(
        {"_id": ObjectId(decision_id)},
        {"$set": {"status": "rejected", "updated_at": now}, "$push": {"history": history_entry}},
    )
    d = await db.decisions.find_one({"_id": ObjectId(decision_id)})
    await log_activity(db, workspace_id, str(current_user["_id"]), "decision_rejected", d.get("title", ""))
    return _dec_out(d)


@router.get("/workspace/{workspace_id}/stats")
async def decision_stats(
    workspace_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await _check_member(db, workspace_id, str(current_user["_id"]))
    total = await db.decisions.count_documents({"workspace_id": workspace_id})
    approved = await db.decisions.count_documents({"workspace_id": workspace_id, "status": "approved"})
    proposed = await db.decisions.count_documents({"workspace_id": workspace_id, "status": "proposed"})
    superseded = await db.decisions.count_documents({"workspace_id": workspace_id, "status": "superseded"})
    rejected = await db.decisions.count_documents({"workspace_id": workspace_id, "status": "rejected"})
    return {"total": total, "approved": approved, "proposed": proposed, "superseded": superseded, "rejected": rejected}
