"""Unit tests for auth service."""

from unittest.mock import Mock

import pytest

from app.core.exceptions import AuthenticationError, ConflictError, ValidationError
from app.models.user import User
from app.services.auth_service import AuthService


@pytest.fixture
def mock_db():
    """Mock database session."""
    return Mock()


@pytest.fixture
def auth_service(mock_db):
    """Create auth service with mock DB."""
    return AuthService(mock_db)


def test_register_validates_password(auth_service):
    """Test that registration validates password strength."""
    # Mock user_repo to return None (no existing user)
    auth_service.user_repo.get_by_email = Mock(return_value=None)

    # Test weak password
    with pytest.raises(ValidationError, match="10 characters"):
        auth_service.register("test@example.com", "weak")

    with pytest.raises(ValidationError, match="uppercase"):
        auth_service.register("test@example.com", "lowercase123")

    with pytest.raises(ValidationError, match="lowercase"):
        auth_service.register("test@example.com", "UPPERCASE123")

    with pytest.raises(ValidationError, match="digit"):
        auth_service.register("test@example.com", "NoDigitsHere")


def test_register_checks_duplicate_email(auth_service):
    """Test that registration checks for duplicate emails."""
    # Mock existing user
    existing_user = User(email="existing@example.com", hashed_password="hashed", is_active=True)
    auth_service.user_repo.get_by_email = Mock(return_value=existing_user)

    with pytest.raises(ConflictError, match="already registered"):
        auth_service.register("existing@example.com", "ValidPass123")


def test_login_with_invalid_credentials(auth_service):
    """Test login with invalid credentials."""
    # Mock no user found
    auth_service.user_repo.get_by_email = Mock(return_value=None)

    with pytest.raises(AuthenticationError, match="Invalid email"):
        auth_service.login("nonexistent@example.com", "password")


def test_login_with_inactive_user(auth_service):
    """Test login with inactive user."""
    from app.core.security import hash_password

    inactive_user = User(
        email="inactive@example.com", hashed_password=hash_password("Password123"), is_active=False
    )
    auth_service.user_repo.get_by_email = Mock(return_value=inactive_user)

    with pytest.raises(AuthenticationError, match="inactive"):
        auth_service.login("inactive@example.com", "Password123")
