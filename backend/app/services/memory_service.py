"""Memory service — CRUD, semantic search, ranking, conflict detection."""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
from app.services.ai_service import generate_embedding, extract_memories
import logging

logger = logging.getLogger(__name__)


def _serialize(doc: dict) -> dict:
    """Convert MongoDB doc to JSON-safe dict."""
    if doc is None:
        return {}
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id", ""))
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


async def create_memory(db, memory_data: dict) -> dict:
    """Create a memory document with embedding."""
    embedding = await generate_embedding(memory_data.get("content", ""))
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": memory_data["user_id"],
        "workspace_id": memory_data["workspace_id"],
        "project_id": memory_data.get("project_id"),
        "memory_type": memory_data.get("memory_type", "fact"),
        "content": memory_data["content"],
        "source": memory_data.get("source", "manual"),
        "source_conversation_id": memory_data.get("source_conversation_id"),
        "embedding": embedding,
        "importance": float(memory_data.get("importance", 0.5)),
        "confidence": float(memory_data.get("confidence", 0.9)),
        "privacy_scope": memory_data.get("privacy_scope", "workspace"),
        "created_at": now,
        "updated_at": now,
        "expires_at": memory_data.get("expires_at"),
        "status": "active",
        "version": 1,
        "history": [],
    }
    result = await db.memories.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


def _cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    if not vec1 or not vec2:
        return 0.0
    min_len = min(len(vec1), len(vec2))
    dot = sum(vec1[i] * vec2[i] for i in range(min_len))
    norm1 = sum(vec1[i] ** 2 for i in range(min_len)) ** 0.5
    norm2 = sum(vec2[i] ** 2 for i in range(min_len)) ** 0.5
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot / (norm1 * norm2))


async def semantic_search(
    db,
    query: str,
    workspace_id: str,
    user_id: str,
    project_id: Optional[str] = None,
    memory_type: Optional[str] = None,
    limit: int = 10,
) -> list[dict]:
    """Search memories using MongoDB Atlas Vector Search when available, falling back to local cosine semantic ranking."""
    query_embedding = await generate_embedding(query)

    # Build filter
    match_filter = {
        "workspace_id": workspace_id,
        "status": "active",
        "$or": [
            {"privacy_scope": "workspace"},
            {"privacy_scope": "project", "project_id": project_id} if project_id else {"privacy_scope": "project"},
            {"privacy_scope": "personal", "user_id": user_id},
        ],
        "$and": [
            {"$or": [{"expires_at": None}, {"expires_at": {"$gt": datetime.now(timezone.utc)}}]}
        ],
    }
    if project_id:
        match_filter["project_id"] = project_id
    if memory_type:
        match_filter["memory_type"] = memory_type

    # 1. Try MongoDB Atlas Vector Search (if index is configured)
    if query_embedding:
        try:
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": "memory_vector_index",
                        "path": "embedding",
                        "queryVector": query_embedding,
                        "numCandidates": limit * 10,
                        "limit": limit,
                        "filter": {
                            "workspace_id": {"$eq": workspace_id},
                            "status": {"$eq": "active"},
                        },
                    }
                },
                {"$addFields": {"score": {"$meta": "vectorSearchScore"}}},
                {"$match": match_filter},
                {"$limit": limit},
            ]
            results = await db.memories.aggregate(pipeline).to_list(limit)
            if results:
                return [_serialize(r) for r in results]
        except Exception as e:
            logger.info("Atlas Vector Search index not yet configured, using direct semantic ranking: %s", e)

    # 2. Direct semantic cosine similarity ranking
    cursor = db.memories.find(match_filter).limit(100)
    docs = await cursor.to_list(100)
    if not docs:
        return []

    query_words = set(query.lower().split())

    scored_docs = []
    for d in docs:
        emb = d.get("embedding", [])
        sim = _cosine_similarity(query_embedding, emb) if (query_embedding and emb) else 0.0
        # Text term match boost
        content_words = set(d.get("content", "").lower().split())
        overlap = len(query_words.intersection(content_words)) / max(len(query_words), 1)
        # Combined score: 65% cosine vector similarity, 20% text overlap, 15% importance
        combined_score = sim * 0.65 + overlap * 0.20 + float(d.get("importance", 0.5)) * 0.15
        serialized = _serialize(d)
        serialized["score"] = round(combined_score, 4)
        scored_docs.append(serialized)

    scored_docs.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    return scored_docs[:limit]


async def get_memory(db, memory_id: str, user_id: str, workspace_id: str) -> Optional[dict]:
    try:
        doc = await db.memories.find_one({
            "_id": ObjectId(memory_id),
            "workspace_id": workspace_id,
            "status": {"$ne": "deleted"},
        })
        if not doc:
            return None
        # Check access
        if doc.get("privacy_scope") == "personal" and doc.get("user_id") != user_id:
            return None
        return _serialize(doc)
    except Exception:
        return None


async def update_memory(db, memory_id: str, updates: dict, user_id: str) -> Optional[dict]:
    try:
        doc = await db.memories.find_one({"_id": ObjectId(memory_id)})
        if not doc:
            return None
        # Save history
        history_entry = {
            "version": doc.get("version", 1),
            "content": doc.get("content"),
            "updated_at": doc.get("updated_at"),
            "updated_by": user_id,
        }
        new_embedding = None
        if "content" in updates:
            new_embedding = await generate_embedding(updates["content"])

        set_data = {
            **{k: v for k, v in updates.items() if v is not None},
            "updated_at": datetime.now(timezone.utc),
            "version": doc.get("version", 1) + 1,
        }
        if new_embedding:
            set_data["embedding"] = new_embedding

        await db.memories.update_one(
            {"_id": ObjectId(memory_id)},
            {
                "$set": set_data,
                "$push": {"history": history_entry},
            },
        )
        updated = await db.memories.find_one({"_id": ObjectId(memory_id)})
        return _serialize(updated)
    except Exception as e:
        logger.error("update_memory error: %s", e)
        return None


async def delete_memory(db, memory_id: str) -> bool:
    try:
        result = await db.memories.update_one(
            {"_id": ObjectId(memory_id)},
            {"$set": {"status": "deleted", "updated_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count > 0
    except Exception:
        return False


async def extract_and_store_memories(
    db, conversation_text: str, user_id: str, workspace_id: str,
    project_id: Optional[str], conversation_id: str,
) -> list[dict]:
    """Extract memories from a conversation and persist them."""
    extracted = await extract_memories(conversation_text)
    stored = []
    for m in extracted:
        if not m.get("content"):
            continue
        memory_data = {
            "user_id": user_id,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "memory_type": m.get("memory_type", "fact"),
            "content": m["content"],
            "importance": float(m.get("importance", 0.5)),
            "privacy_scope": m.get("privacy_scope", "workspace"),
            "source": "ai_extraction",
            "source_conversation_id": conversation_id,
        }
        created = await create_memory(db, memory_data)
        stored.append(created)
    return stored


async def get_memories_list(
    db, workspace_id: str, user_id: str,
    project_id: Optional[str] = None,
    memory_type: Optional[str] = None,
    privacy_scope: Optional[str] = None,
    skip: int = 0, limit: int = 50,
) -> tuple[list[dict], int]:
    """Paginated list of memories for a workspace."""
    base_filter = {
        "workspace_id": workspace_id,
        "status": "active",
        "$or": [
            {"privacy_scope": "workspace"},
            {"privacy_scope": "project"},
            {"privacy_scope": "personal", "user_id": user_id},
        ],
    }
    if project_id:
        base_filter["project_id"] = project_id
    if memory_type:
        base_filter["memory_type"] = memory_type
    if privacy_scope:
        base_filter["privacy_scope"] = privacy_scope

    total = await db.memories.count_documents(base_filter)
    cursor = db.memories.find(base_filter).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(limit)
    return [_serialize(d) for d in docs], total
