"""Gemini AI service — text generation and embeddings via REST."""
import httpx
import json
import logging
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


async def generate_text(prompt: str, system: Optional[str] = None) -> str:
    """Call Gemini generateContent with automatic model fallback."""
    if not settings.gemini_api_key:
        return "AI features are not configured. Please set GEMINI_API_KEY."

    contents = []
    if system:
        contents.append({"role": "user", "parts": [{"text": f"[SYSTEM]\n{system}\n\n[USER]\n{prompt}"}]})
    else:
        contents.append({"role": "user", "parts": [{"text": prompt}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 2048,
        },
    }

    # Fallback model list
    models_to_try = [settings.gemini_model, "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.5-flash", "gemini-3.8-flash"]
    seen = set()
    unique_models = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

    async with httpx.AsyncClient(timeout=35) as client:
        last_error = ""
        for model in unique_models:
            url = f"{GEMINI_BASE}/{model}:generateContent"
            try:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={"x-goog-api-key": settings.gemini_api_key},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0] and "parts" in candidates[0]["content"]:
                        return candidates[0]["content"]["parts"][0].get("text", "")
                else:
                    last_error = f"{resp.status_code}: {resp.text[:100]}"
                    logger.warning("Gemini text error on %s: %s", model, last_error)
            except Exception as e:
                last_error = str(e)
                logger.warning("Gemini request exception on %s: %s", model, e)
        return f"AI service temporarily unavailable. ({last_error})"


async def generate_embedding(text: str) -> list[float]:
    """Generate vector embedding using MongoDB Atlas AI (Voyage) or Gemini."""
    # 1. Try MongoDB Atlas AI Embedding API (Voyage AI) if configured
    if getattr(settings, "mongodb_atlas_ai_key", ""):
        try:
            url = getattr(settings, "mongodb_atlas_ai_endpoint", "https://ai.mongodb.com/v1/embeddings")
            payload = {
                "input": [text if text.strip() else "empty"],
                "model": "voyage-3.5",
            }
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {settings.mongodb_atlas_ai_key}",
                        "Content-Type": "application/json",
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    values = data.get("data", [{}])[0].get("embedding", [])
                    if values:
                        return values
                else:
                    logger.warning("MongoDB Atlas AI embedding error %s: %s", resp.status_code, resp.text[:120])
        except Exception as e:
            logger.warning("MongoDB Atlas AI embedding request failed: %s", e)

    # 2. Try Gemini embedding
    if settings.gemini_api_key:
        emb_models = ["gemini-embedding-001", "gemini-embedding-2-preview"]
        async with httpx.AsyncClient(timeout=15) as client:
            for emb_model in emb_models:
                url = f"{GEMINI_BASE}/{emb_model}:embedContent"
                payload = {"model": f"models/{emb_model}", "content": {"parts": [{"text": text}]}}
                try:
                    resp = await client.post(
                        url,
                        json=payload,
                        headers={"x-goog-api-key": settings.gemini_api_key},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        values = data.get("embedding", {}).get("values", [])
                        if values:
                            return values
                except Exception as e:
                    logger.warning("Gemini embedding error on %s: %s", emb_model, e)

    # 3. Fallback deterministic pseudo-embedding (for offline/test environments)
    import hashlib
    h = hashlib.sha256(text.encode("utf-8")).digest()
    return [(b - 128) / 128.0 for b in h]


async def extract_memories(conversation_text: str, workspace_context: str = "") -> list[dict]:
    """Use Gemini to extract durable memories from a conversation."""
    prompt = f"""You are a memory extraction engine for a team knowledge system.

Analyze this conversation and extract durable facts, decisions, preferences, constraints, lessons, or responsibilities worth remembering for the team.

Workspace context:
{workspace_context}

Conversation:
{conversation_text}

Return a JSON array of memory objects. Each object must have:
- "content": clear, concise statement of the memory (max 200 chars)
- "memory_type": one of: fact, preference, decision, constraint, task, architecture, responsibility, bug_solution, feedback, lesson, summary, outcome
- "importance": float 0.0-1.0 (how important/durable this knowledge is)
- "privacy_scope": "workspace" (shared) or "personal"

Return ONLY valid JSON array, no markdown, no explanation.
If no durable memories found, return [].
"""
    response = await generate_text(prompt)
    try:
        # Strip markdown code blocks if present
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Memory extraction parse error: %s", response[:200])
        return []


async def detect_conflicts(new_decision: str, existing_decisions: list[dict]) -> dict:
    """Check if a new decision conflicts with approved existing ones."""
    if not existing_decisions:
        return {"has_conflict": False, "conflicts": []}

    existing_text = "\n".join(
        f"- [{d.get('status', 'unknown')}] {d.get('title', '')}: {d.get('description', '')}"
        for d in existing_decisions
        if d.get("status") == "approved"
    )

    prompt = f"""You are a decision conflict detector.

New decision: {new_decision}

Existing approved decisions:
{existing_text}

Does the new decision conflict with any existing approved decisions?

Return JSON:
{{
  "has_conflict": true/false,
  "conflicts": [
    {{"decision": "title of conflicting decision", "reason": "why they conflict"}}
  ]
}}

Return ONLY valid JSON, no explanation.
"""
    response = await generate_text(prompt)
    try:
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        return {"has_conflict": False, "conflicts": []}


async def summarize_conversation(messages: list[dict]) -> str:
    """Summarize a conversation into a concise title and summary."""
    text = "\n".join(
        f"{m.get('role', 'user').upper()}: {m.get('content', '')}"
        for m in messages[:30]  # limit tokens
    )
    prompt = f"""Summarize this team AI conversation in 1-2 sentences. Be specific about what was decided or learned.

{text}

Return only the summary text, no labels or formatting."""
    return await generate_text(prompt)


async def build_chat_response(
    user_message: str,
    memories: list[dict],
    conversation_history: list[dict],
    project_context: Optional[str] = None,
) -> tuple[str, list[dict]]:
    """Build a context-aware AI chat response using retrieved memories."""
    memory_context = ""
    used_memories = []
    if memories:
        memory_context = "RELEVANT TEAM MEMORIES:\n"
        for i, m in enumerate(memories[:8], 1):
            memory_context += f"{i}. [{m.get('memory_type', 'fact')}] {m.get('content', '')} (importance: {m.get('importance', 0.5):.1f})\n"
            used_memories.append({
                "memory_id": str(m.get("_id", "")),
                "content": m.get("content", ""),
                "memory_type": m.get("memory_type", "fact"),
                "importance": m.get("importance", 0.5),
                "relevance_score": m.get("score", 0.0),
            })

    history_text = ""
    for msg in conversation_history[-10:]:
        role = "User" if msg.get("role") == "user" else "TeamBrain"
        history_text += f"{role}: {msg.get('content', '')}\n"

    system_prompt = f"""You are TeamBrain, an AI assistant with persistent memory for software teams.
You help teams track decisions, manage knowledge, and maintain project context.
Be concise, technical, and reference team memories when relevant.
Always indicate when you're using stored memories.

{f"Project context: {project_context}" if project_context else ""}
{memory_context}

Previous conversation:
{history_text}"""

    response = await generate_text(user_message, system=system_prompt)
    return response, used_memories
