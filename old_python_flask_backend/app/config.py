"""SafeRoute Application Configuration.

Centralized configuration management for the SafeRoute application using Pydantic
settings. Handles environment variables, API keys, database connections, and
feature-specific settings including H3 spatial indexing configuration.

Environment variables are loaded from .env file in development and from the
system environment in production.

Author: Sriram Sundar
Email: ss2d22@soton.ac.uk
Repository: https://github.com/ss2d22/saferoute
"""

from typing import Dict, List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Crime category time-of-day weights (based on UK crime statistical patterns)
# Format: {category_id: {time_bucket: multiplier}}
# These weights represent the relative likelihood of each crime type at different times
CRIME_TIME_WEIGHTS: Dict[str, Dict[str, float]] = {
    "violent-crime": {"night": 1.8, "evening": 1.5, "day": 0.8, "morning": 0.6},
    "anti-social-behaviour": {"night": 1.7, "evening": 1.6, "day": 0.7, "morning": 0.5},
    "burglary": {"night": 1.5, "day": 1.2, "evening": 1.0, "morning": 0.8},
    "robbery": {"night": 1.6, "evening": 1.4, "day": 0.9, "morning": 0.7},
    "theft-from-the-person": {"evening": 1.5, "day": 1.3, "night": 1.0, "morning": 0.6},
    "vehicle-crime": {"night": 1.7, "evening": 1.2, "day": 0.8, "morning": 0.6},
    "shoplifting": {"day": 1.8, "evening": 1.3, "morning": 0.7, "night": 0.2},
    "bicycle-theft": {"day": 1.5, "evening": 1.3, "night": 0.8, "morning": 0.9},
    "drugs": {"night": 1.4, "evening": 1.3, "day": 1.0, "morning": 0.8},
    "public-order": {"night": 1.6, "evening": 1.5, "day": 0.9, "morning": 0.6},
    "possession-of-weapons": {"night": 1.5, "evening": 1.4, "day": 1.0, "morning": 0.7},
    "criminal-damage-arson": {"night": 1.6, "evening": 1.2, "day": 0.9, "morning": 0.7},
    "other-theft": {"day": 1.3, "evening": 1.2, "night": 1.0, "morning": 0.9},
    "other-crime": {"day": 1.0, "night": 1.0, "evening": 1.0, "morning": 1.0},
}


class Settings(BaseSettings):
    """Application settings - single source of truth for configuration."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+psycopg2://saferoute:changeme@localhost:5432/saferoute"
    )
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "saferoute"
    POSTGRES_USER: str = "saferoute"
    POSTGRES_PASSWORD: str = "changeme"

    # JWT
    JWT_SECRET_KEY: str = Field(default="changeme-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # External APIs
    ORS_API_KEY: str = Field(default="")
    ORS_API_URL: str = "https://api.openrouteservice.org"
    POLICE_API_BASE_URL: str = "https://data.police.uk/api"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"

    # App
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8080"

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_AUTH_PER_MINUTE: int = 5

    # Safety Scoring
    DEFAULT_LOOKBACK_MONTHS: int = 12
    DEFAULT_SAFETY_WEIGHT: float = 0.8
    DEFAULT_ROUTE_BUFFER_M: int = 50
    MAX_ROUTE_DISTANCE_KM: int = 100

    # Grid (H3 Hexagonal)
    GRID_CELL_SIZE_M: int = 73  # H3 Resolution 10: ~73m edge length, ~13,781 m² hexagons
    GRID_TYPE: str = "h3_hexagonal"
    H3_RESOLUTION: int = 10
    SOUTHAMPTON_BBOX: str = "50.85,-1.55,51.0,-1.3"

    @field_validator("CORS_ORIGINS")
    @classmethod
    def parse_cors_origins(cls, v: str) -> List[str]:
        """Parse comma-separated CORS origins."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        """Get CORS origins as a list."""
        if isinstance(self.CORS_ORIGINS, str):
            return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        return self.CORS_ORIGINS


# Global settings instance
_settings: Settings | None = None


def get_settings() -> Settings:
    """Get settings instance (singleton pattern)."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
