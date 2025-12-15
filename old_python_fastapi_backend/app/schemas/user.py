"""User-related schemas."""

from pydantic import BaseModel, Field


class UserSettings(BaseModel):
    """User settings."""

    history_enabled: bool = True
    history_retention_days: int = Field(default=90, ge=1, le=365)
    default_safety_weight: float = Field(default=0.8, ge=0.0, le=1.0)
    default_mode: str | None = None


class UserSettingsUpdate(BaseModel):
    """User settings update request."""

    history_enabled: bool | None = None
    history_retention_days: int | None = Field(None, ge=1, le=365)
    default_safety_weight: float | None = Field(None, ge=0.0, le=1.0)
    default_mode: str | None = None


class DeleteAccountRequest(BaseModel):
    """Delete account request (requires password confirmation)."""

    password: str
