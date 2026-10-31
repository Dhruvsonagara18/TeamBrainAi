from fastapi import APIRouter, Depends, HTTPException, Query
from app.security import get_current_user
from app.database import get_db
from app.models.schemas import SendMessageRequest, ConversationCreate
from app.services.ai_service import build_chat_response, summarize_conversation
from app.services.memory_service import semantic_search, extract_and_store_memories
from app.services.activity_service import log_activity
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter(prefix="/chat", tags=["chat"])


def _conv_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "workspace_id": doc.get("workspace_id", ""),
        "project_id": doc.get("project_id"),
        "title": doc.get("title", "New conversation"),
        "user_id": doc.get("user_id", ""),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat(),
        "updated_at": doc.get("updated_at", datetime.now(timezone.utc)).isoformat(),
    }


def _msg_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "conversation_id": doc.get("conversation_id", ""),
        "role": doc.get("role", "user"),
        "content": doc.get("content", ""),
        "used_memories": doc.get("used_memories", []),
        "extracted_memories": doc.get("extracted_memories", []),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat(),
    }


async def _check_workspace_member(db, workspace_id: str, user_id: str):
    member = await db.workspace_members.find_one({"workspace_id": workspace_id, "user_id": user_id})
    if not member:
        raise HTTPException(403, "Not a member of this workspace")
    return member


@router.post("/conversations", status_code=201)
async def create_conversation(
    body: ConversationCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_workspace_member(db, body.workspace_id, str(current_user["_id"]))
    now = datetime.now(timezone.utc)
    doc = {
        "workspace_id": body.workspace_id,
        "project_id": body.project_id,
        "user_id": str(current_user["_id"]),
        "title": body.title or "New conversation",
        "created_at": now,
        "updated_at": now,
    }
    result = await db.conversations.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _conv_out(doc)


@router.get("/conversations")
async def list_conversations(
    workspace_id: str = Query(...),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    await _check_workspace_member(db, workspace_id, str(current_user["_id"]))
    convs = await db.conversations.find(
        {"workspace_id": workspace_id, "user_id": str(current_user["_id"])}
    ).sort("updated_at", -1).limit(50).to_list(50)
    return [_conv_out(c) for c in convs]


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv["user_id"] != str(current_user["_id"]):
        raise HTTPException(403, "Access denied")
    msgs = await db.messages.find(
        {"conversation_id": conversation_id}
    ).sort("created_at", 1).to_list(200)
    return [_msg_out(m) for m in msgs]


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: SendMessageRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    if db is None:
        raise HTTPException(503, "Database not configured")
    conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv["user_id"] != str(current_user["_id"]):
        raise HTTPException(403, "Access denied")

    workspace_id = conv["workspace_id"]
    project_id = body.project_id or conv.get("project_id")
    now = datetime.now(timezone.utc)

    # 1. Save user message
    user_msg_doc = {
        "conversation_id": conversation_id,
        "role": "user",
        "content": body.content,
        "created_at": now,
    }
    await db.messages.insert_one(user_msg_doc)

    # 2. Retrieve relevant memories
    memories = await semantic_search(
        db=db,
        query=body.content,
        workspace_id=workspace_id,
        user_id=str(current_user["_id"]),
        project_id=project_id,
        limit=8,
    )

    # 3. Get conversation history
    history = await db.messages.find(
        {"conversation_id": conversation_id}
    ).sort("created_at", 1).limit(20).to_list(20)
    history_dicts = [{"role": m["role"], "content": m["content"]} for m in history]

    # 4. Get project context
    project_context = None
    if project_id:
        proj = await db.projects.find_one({"_id": ObjectId(project_id)})
        if proj:
            project_context = f"{proj.get('name', '')}: {proj.get('description', '')}"

    # 5. Generate AI response
    ai_text, used_memories = await build_chat_response(
        user_message=body.content,
        memories=memories,
        conversation_history=history_dicts,
        project_context=project_context,
    )

    # 6. Save AI message
    ai_msg_doc = {
        "conversation_id": conversation_id,
        "role": "assistant",
        "content": ai_text,
        "used_memories": used_memories,
        "extracted_memories": [],
        "created_at": datetime.now(timezone.utc),
    }
    ai_result = await db.messages.insert_one(ai_msg_doc)
    ai_msg_doc["_id"] = ai_result.inserted_id

    # 7. Extract memories from this exchange (async, don't block)
    exchange_text = f"User: {body.content}\nAssistant: {ai_text}"
    extracted = await extract_and_store_memories(
        db=db,
        conversation_text=exchange_text,
        user_id=str(current_user["_id"]),
        workspace_id=workspace_id,
        project_id=project_id,
        conversation_id=conversation_id,
    )
    # Update AI message with extracted memory IDs
    if extracted:
        extracted_ids = [m["id"] for m in extracted]
        await db.messages.update_one(
            {"_id": ai_result.inserted_id},
            {"$set": {"extracted_memories": extracted_ids}},
        )
        ai_msg_doc["extracted_memories"] = extracted_ids

    # 8. Update conversation title if first message
    if conv.get("title") == "New conversation" and history_dicts:
        summary = await summarize_conversation(history_dicts[-4:] + [{"role": "user", "content": body.content}])
        await db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {"title": summary[:80], "updated_at": datetime.now(timezone.utc)}},
        )
    else:
        await db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {"updated_at": datetime.now(timezone.utc)}},
        )

    await log_activity(db, workspace_id, str(current_user["_id"]), "chat_message", body.content[:60])

    return {
        "user_message": _msg_out(user_msg_doc),
        "ai_message": _msg_out(ai_msg_doc),
        "extracted_memories_count": len(extracted),
    }


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv["user_id"] != str(current_user["_id"]):
        raise HTTPException(403, "Access denied")
    await db.conversations.delete_one({"_id": ObjectId(conversation_id)})
    await db.messages.delete_many({"conversation_id": conversation_id})
