"""User service for managing user settings and account."""

import uuid
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.core.exceptions import AuthenticationError, NotFoundError
from app.core.security import verify_password
from app.repositories.user_repository import UserRepository


class UserService:
    """User management business logic."""

    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)

    def get_user_settings(self, user_id: uuid.UUID) -> Dict[str, Any]:
        """Get user settings.

        Raises:
            NotFoundError: If user not found
        """
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        return user.settings

    def update_user_settings(
        self, user_id: uuid.UUID, settings_update: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update user settings.

        Returns:
            Updated settings dict

        Raises:
            NotFoundError: If user not found
        """
        user = self.user_repo.update_settings(user_id, settings_update)
        if not user:
            raise NotFoundError("User not found")
        return user.settings

    def delete_user_account(self, user_id: uuid.UUID, password: str) -> None:
        """Delete user account (requires password confirmation).

        Raises:
            AuthenticationError: If password is incorrect
            NotFoundError: If user not found
        """
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        # Verify password
        if not verify_password(password, user.hashed_password):
            raise AuthenticationError("Invalid password")

        # Revoke all refresh sessions
        self.user_repo.revoke_all_user_sessions(user_id)

        # Hard delete user (CASCADE will delete history and sessions)
        self.user_repo.delete(user_id)
