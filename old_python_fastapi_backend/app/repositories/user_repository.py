"""User repository for data access."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.user import RefreshSession, User


class UserRepository:
    """User data access layer."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        """Get user by ID."""
        return self.db.query(User).filter(User.id == user_id).first()

    def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        return self.db.query(User).filter(User.email == email).first()

    def create(self, email: str, hashed_password: str) -> User:
        """Create a new user."""
        user = User(
            email=email,
            hashed_password=hashed_password,
            is_active=True,
            is_superuser=False,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_last_login(self, user_id: uuid.UUID) -> None:
        """Update user's last login timestamp."""
        user = self.get_by_id(user_id)
        if user:
            user.last_login_at = datetime.utcnow()
            self.db.commit()

    def update_settings(self, user_id: uuid.UUID, settings: dict) -> Optional[User]:
        """Update user settings."""
        from sqlalchemy.orm.attributes import flag_modified

        user = self.get_by_id(user_id)
        if user:
            user.settings.update(settings)
            # Mark the settings column as modified so SQLAlchemy persists the change
            flag_modified(user, "settings")
            self.db.commit()
            self.db.refresh(user)
        return user

    def delete(self, user_id: uuid.UUID) -> bool:
        """Delete user (hard delete)."""
        user = self.get_by_id(user_id)
        if user:
            self.db.delete(user)
            self.db.commit()
            return True
        return False

    def create_refresh_session(
        self,
        user_id: uuid.UUID,
        token_hash: str,
        expires_at: datetime,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> RefreshSession:
        """Create a refresh token session."""
        session = RefreshSession(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_refresh_session(self, token_hash: str) -> Optional[RefreshSession]:
        """Get an active refresh session by token hash."""
        return (
            self.db.query(RefreshSession)
            .filter(
                and_(
                    RefreshSession.token_hash == token_hash,
                    RefreshSession.revoked_at.is_(None),
                    RefreshSession.expires_at > datetime.utcnow(),
                )
            )
            .first()
        )

    def revoke_refresh_session(self, session_id: uuid.UUID) -> None:
        """Revoke a refresh session."""
        session = self.db.query(RefreshSession).filter(RefreshSession.id == session_id).first()
        if session:
            session.revoked_at = datetime.utcnow()
            self.db.commit()

    def revoke_all_user_sessions(self, user_id: uuid.UUID) -> None:
        """Revoke all refresh sessions for a user."""
        self.db.query(RefreshSession).filter(
            and_(
                RefreshSession.user_id == user_id,
                RefreshSession.revoked_at.is_(None),
            )
        ).update({"revoked_at": datetime.utcnow()})
        self.db.commit()
