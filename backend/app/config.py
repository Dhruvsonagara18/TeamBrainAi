from pydantic_settings import BaseSettings
from functools import lru_cache
import secrets


class Settings(BaseSettings):
    # MongoDB
    mongodb_uri: str = ""
    database_name: str = "teambrain"

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite"
    embedding_model: str = "voyage-3.5"

    # MongoDB Atlas AI Embedding API
    mongodb_atlas_ai_key: str = ""
    mongodb_atlas_ai_endpoint: str = "https://ai.mongodb.com/v1/embeddings"

    # JWT
    jwt_secret_key: str = secrets.token_hex(32)
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # CORS
    frontend_origin: str = "http://localhost:5173"

    # App
    environment: str = "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
