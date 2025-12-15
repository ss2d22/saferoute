"""FastAPI dependencies."""

from typing import Generator, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.base import get_db
from app.models.user import User
from app.services.auth_service import AuthService

# Security scheme for JWT Bearer tokens
security = HTTPBearer()


def get_settings_dependency() -> Settings:
    """Get settings instance as a dependency."""
    return get_settings()


def get_db_dependency() -> Generator[Session, None, None]:
    """Get database session as a dependency."""
    return get_db()


def get_current_user_dependency(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Get current authenticated user from JWT token.

    Raises:
        HTTPException: If token is invalid or user not found
    """
    token = credentials.credentials
    auth_service = AuthService(db)
    return auth_service.get_current_user(token)


def get_optional_current_user(
    db: Session = Depends(get_db),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
) -> Optional[User]:
    """Get current user if authenticated, None otherwise."""
    if not credentials:
        return None
    try:
        token = credentials.credentials
        auth_service = AuthService(db)
        return auth_service.get_current_user(token)
    except Exception:
        return None


def get_current_active_user(
    current_user: User = Depends(get_current_user_dependency),
) -> User:
    """Ensure current user is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user
