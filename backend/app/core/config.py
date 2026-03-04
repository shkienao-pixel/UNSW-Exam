"""Global settings loaded from environment variables."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # OpenAI
    openai_api_key: str = ""

    # Google Gemini (optional — can also be set via admin panel DB)
    gemini_api_key: str = ""

    # DeepSeek (optional — can also be set via admin panel DB)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"

    # Data directory (local files: PDFs, ChromaDB)
    data_dir: str = "../data"

    # Storage
    supabase_storage_bucket: str = "artifacts"

    # Admin secret (Streamlit uses this to bypass review)
    admin_secret: str = "change-me-in-production"
    # Optional second admin secret (comma-separated or a single extra value)
    admin_secret_extra: str = ""

    @property
    def admin_secrets_set(self) -> set[str]:
        """Return all valid admin secrets as a set."""
        secrets = {self.admin_secret} if self.admin_secret else set()
        for s in self.admin_secret_extra.split(","):
            s = s.strip()
            if s:
                secrets.add(s)
        return secrets

    # Supabase JWT secret — used for offline signature verification in fallback auth
    # Same value as SUPABASE_JWT_SECRET in your Supabase project settings
    jwt_secret: str = ""

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000,http://localhost:8501"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).resolve()

    @property
    def chroma_path(self) -> Path:
        return self.data_path / "chroma"

    @property
    def courses_path(self) -> Path:
        return self.data_path / "courses"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()  # type: ignore[call-arg]
    return _settings
