"""Unit tests for security functions."""

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_refresh_token,
    validate_password_strength,
    verify_password,
)


def test_hash_password():
    """Test password hashing."""
    password = "TestPassword123"
    hashed = hash_password(password)
    assert hashed != password
    assert len(hashed) > 0


def test_verify_password():
    """Test password verification."""
    password = "TestPassword123"
    hashed = hash_password(password)
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_create_access_token():
    """Test JWT access token creation."""
    user_id = "test-user-123"
    token = create_access_token(subject=user_id)
    assert isinstance(token, str)
    assert len(token) > 0

    # Decode and verify
    payload = decode_token(token)
    assert payload["sub"] == user_id
    assert payload["type"] == "access"


def test_create_refresh_token():
    """Test refresh token creation."""
    token = create_refresh_token()
    assert isinstance(token, str)
    assert len(token) > 0


def test_hash_refresh_token():
    """Test refresh token hashing."""
    token = create_refresh_token()
    hashed = hash_refresh_token(token)
    assert isinstance(hashed, str)
    assert len(hashed) == 64  # SHA256 produces 64-character hex string
    assert hashed != token


def test_validate_password_strength():
    """Test password strength validation."""
    # Valid password
    is_valid, error = validate_password_strength("ValidPass123")
    assert is_valid is True
    assert error is None

    # Too short
    is_valid, error = validate_password_strength("Short1A")
    assert is_valid is False
    assert "10 characters" in error

    # No uppercase
    is_valid, error = validate_password_strength("lowercase123")
    assert is_valid is False
    assert "uppercase" in error

    # No lowercase
    is_valid, error = validate_password_strength("UPPERCASE123")
    assert is_valid is False
    assert "lowercase" in error

    # No digit
    is_valid, error = validate_password_strength("NoDigitsHere")
    assert is_valid is False
    assert "digit" in error
