"""Authentication service."""

import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple

from jose import JWTError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.exceptions import (
    AuthenticationError,
    ConflictError,
    ValidationError,
    credentials_exception,
    inactive_user_exception,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_refresh_token,
    validate_password_strength,
    verify_password,
)
from app.models.user import User
from app.repositories.user_repository import UserRepository

settings = get_settings()


class AuthService:
    """User authentication and JWT token management."""

    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)

    def register(self, email: str, password: str) -> User:
        """Register a new user.

        Raises:
            ConflictError: If email already exists
            ValidationError: If password doesn't meet requirements
        """
        # Check if user exists
        existing_user = self.user_repo.get_by_email(email)
        if existing_user:
            raise ConflictError("Email already registered")

        # Validate password strength
        is_valid, error_msg = validate_password_strength(password)
        if not is_valid:
            raise ValidationError(error_msg)

        # Hash password and create user
        hashed_pwd = hash_password(password)
        user = self.user_repo.create(email=email, hashed_password=hashed_pwd)
        return user

    def login(
        self,
        email: str,
        password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[str, str, int]:
        """Login user and return tokens.

        Returns:
            Tuple of (access_token, refresh_token, expires_in_seconds)

        Raises:
            AuthenticationError: If credentials are invalid or user is inactive
        """
        # Get user
        user = self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise AuthenticationError("Invalid email or password")

        # Check if user is active
        if not user.is_active:
            raise AuthenticationError("User account is inactive")

        # Update last login
        self.user_repo.update_last_login(user.id)

        # Create tokens
        access_token = create_access_token(subject=str(user.id))
        refresh_token_raw = create_refresh_token()
        refresh_token_hash = hash_refresh_token(refresh_token_raw)

        # Store refresh session
        expires_at = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        self.user_repo.create_refresh_session(
            user_id=user.id,
            token_hash=refresh_token_hash,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Calculate expires_in for access token
        expires_in = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60

        return access_token, refresh_token_raw, expires_in

    def refresh(self, refresh_token: str) -> tuple[str, str, int]:
        """Refresh access token using refresh token.

        Returns:
            Tuple of (new_access_token, new_refresh_token, expires_in_seconds)

        Raises:
            AuthenticationError: If refresh token is invalid or expired
        """
        # Hash the provided token and look up session
        token_hash = hash_refresh_token(refresh_token)
        session = self.user_repo.get_refresh_session(token_hash)

        if not session:
            raise AuthenticationError("Invalid or expired refresh token")

        # Get user
        user = self.user_repo.get_by_id(session.user_id)
        if not user or not user.is_active:
            raise AuthenticationError("User not found or inactive")

        # Revoke old session (token rotation)
        self.user_repo.revoke_refresh_session(session.id)

        # Create new tokens
        access_token = create_access_token(subject=str(user.id))
        new_refresh_token_raw = create_refresh_token()
        new_refresh_token_hash = hash_refresh_token(new_refresh_token_raw)

        # Store new refresh session
        expires_at = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        self.user_repo.create_refresh_session(
            user_id=user.id,
            token_hash=new_refresh_token_hash,
            expires_at=expires_at,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
        )

        expires_in = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60

        return access_token, new_refresh_token_raw, expires_in

    def logout(self, refresh_token: str, revoke_all: bool = False) -> None:
        """Logout user by revoking refresh token(s).

        Args:
            refresh_token: The refresh token to revoke
            revoke_all: If True, revoke all sessions for the user

        Raises:
            AuthenticationError: If refresh token is invalid
        """
        token_hash = hash_refresh_token(refresh_token)
        session = self.user_repo.get_refresh_session(token_hash)

        if not session:
            raise AuthenticationError("Invalid refresh token")

        if revoke_all:
            self.user_repo.revoke_all_user_sessions(session.user_id)
        else:
            self.user_repo.revoke_refresh_session(session.id)

    def get_current_user(self, token: str) -> User:
        """Get current user from access token.

        Raises:
            HTTPException: If token is invalid or user not found
        """
        try:
            payload = decode_token(token)
            user_id_str: str = payload.get("sub")
            if user_id_str is None:
                raise credentials_exception()

            # Check token type
            token_type = payload.get("type")
            if token_type != "access":
                raise credentials_exception()

            user_id = uuid.UUID(user_id_str)
        except (JWTError, ValueError):
            raise credentials_exception()

        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise credentials_exception()

        if not user.is_active:
            raise inactive_user_exception()

        return user
