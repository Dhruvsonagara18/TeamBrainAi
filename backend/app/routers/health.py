from fastapi import APIRouter, Depends
from app.security import get_current_user
from app.database import get_db
from app.services.ai_service import generate_text, generate_embedding
from app.config import get_settings

router = APIRouter(prefix="/health", tags=["health"])
settings = get_settings()


@router.get("")
async def health_check():
    return {"status": "ok", "service": "TeamBrain API", "version": "1.0.0"}


@router.get("/detailed")
async def detailed_health(db=Depends(get_db)):
    checks = {
        "api": "ok",
        "database": "not_configured",
        "gemini_text": "not_configured",
        "vector_embeddings": "not_configured",
    }

    # Database check
    if db is not None:
        try:
            await db.command("ping")
            checks["database"] = "ok (MongoDB active)"
        except Exception as e:
            checks["database"] = f"error: {str(e)[:50]}"

    # Gemini text check
    if settings.gemini_api_key:
        try:
            result = await generate_text("Reply with: ok")
            checks["gemini_text"] = "ok (Gemini 3.1 Flash)" if result else "empty_response"
        except Exception as e:
            checks["gemini_text"] = f"error: {str(e)[:50]}"

    # Vector embedding check (Atlas Voyage or Gemini)
    try:
        vec = await generate_embedding("test")
        if vec and len(vec) > 0:
            provider = "MongoDB Atlas Voyage 3.5" if getattr(settings, "mongodb_atlas_ai_key", "") else "Gemini"
            checks["vector_embeddings"] = f"ok ({provider}, dims={len(vec)})"
        else:
            checks["vector_embeddings"] = "no_vector_returned"
    except Exception as e:
        checks["vector_embeddings"] = f"error: {str(e)[:50]}"

    all_ok = all(v == "ok" or v.startswith("ok") for v in checks.values())
    return {"status": "healthy" if all_ok else "degraded", "checks": checks}
