from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

# Resolve .env relative to this file so it works regardless of cwd
# (fixes --reload multiprocessing worker spawning from a different directory)
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "ClaimShield AI"
    app_version: str = "0.1.0"
    debug: bool = False
    environment: str = "development"

    # API
    api_prefix: str = "/api/v1"
    allowed_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Database
    database_url: str = "postgresql+asyncpg://claimshield:claimshield@localhost:5432/claimshield"
    database_url_sync: str = "postgresql+psycopg2://claimshield:claimshield@localhost:5432/claimshield"

    # Redis — used ONLY for:
    #   1. Caching retrieved payer policy chunks (payer+CPT key, 24h TTL)
    #   2. Storing LangGraph session/workflow state by run_id
    #   3. Rate limiting and job status tracking
    # Redis is NOT the vector store. pgvector on Postgres is the vector store.
    redis_url: str = "redis://localhost:6379/0"
    policy_chunk_cache_ttl_seconds: int = 86400   # 24 hours
    workflow_state_ttl_seconds: int = 86400        # 24 hours
    rate_limit_window_seconds: int = 60
    rate_limit_max_requests: int = 30

    # Google AI
    google_api_key: str = ""
    gemini_model: str = "models/gemini-3.1-flash-lite"  # confirmed available via list_models()
    # Confirmed available models for this API key (google-generativeai 0.7.2, v1beta):
    #   models/gemini-embedding-001  → 3072 dims (stable)
    #   models/gemini-embedding-2    → 3072 dims (newer)
    embedding_model: str = "models/gemini-embedding-001"
    embedding_model_fallback: str = "models/gemini-embedding-2"
    embedding_dimensions: int = 3072

    # LLM settings
    llm_temperature: float = 0.0
    llm_max_tokens: int = 4096
    llm_timeout_seconds: int = 60
    llm_max_retries: int = 3

    # Vector retrieval
    retrieval_top_k: int = 6
    retrieval_similarity_threshold: float = 0.65

    # Admin API key — protects /admin/* endpoints
    # Set ADMIN_API_KEY in .env; defaults to a demo value only
    admin_api_key: str = "claimshield-admin-2024"


@lru_cache
def get_settings() -> Settings:
    return Settings()

