"""Integration tests for authentication flow."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import RefreshSession, User


def test_register_user(client: TestClient, db: Session):
    """Test user registration."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@example.com", "password": "SecurePass123"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["is_active"] is True
    assert "id" in data

    # Verify user in database
    user = db.query(User).filter(User.email == "newuser@example.com").first()
    assert user is not None
    assert user.is_active is True


def test_register_duplicate_email(client: TestClient, test_user: User):
    """Test registration with duplicate email."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "SecurePass123"},
    )

    assert response.status_code == 409
    assert "already registered" in response.json()["detail"].lower()


def test_register_weak_password(client: TestClient):
    """Test registration with weak password."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@example.com", "password": "weak"},
    )

    assert response.status_code == 422


def test_login_success(client: TestClient, test_user: User):
    """Test successful login."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "TestPassword123"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900  # 15 minutes


def test_login_wrong_password(client: TestClient, test_user: User):
    """Test login with wrong password."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "WrongPassword"},
    )

    assert response.status_code == 401


def test_login_nonexistent_user(client: TestClient):
    """Test login with non-existent user."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@example.com", "password": "SomePassword123"},
    )

    assert response.status_code == 401


def test_get_current_user(client: TestClient, auth_headers: dict):
    """Test getting current user info."""
    response = client.get("/api/v1/auth/me", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["is_active"] is True


def test_get_current_user_no_token(client: TestClient):
    """Test getting current user without token."""
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 403


def test_get_current_user_invalid_token(client: TestClient):
    """Test getting current user with invalid token."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 401


def test_refresh_token(client: TestClient, test_user: User):
    """Test token refresh."""
    # Login first
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "TestPassword123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    # Refresh
    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["refresh_token"] != refresh_token  # Token should be rotated


def test_refresh_token_invalid(client: TestClient):
    """Test refresh with invalid token."""
    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "invalid-refresh-token"},
    )

    assert response.status_code == 401


def test_logout(client: TestClient, test_user: User, db: Session):
    """Test logout."""
    # Login first
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "TestPassword123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    # Logout
    response = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
    )

    assert response.status_code == 200

    # Verify session is revoked
    from app.core.security import hash_refresh_token

    token_hash = hash_refresh_token(refresh_token)
    session = db.query(RefreshSession).filter(RefreshSession.token_hash == token_hash).first()
    assert session is not None
    assert session.revoked_at is not None


def test_complete_auth_flow(client: TestClient, db: Session):
    """Test complete authentication flow."""
    # 1. Register
    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "flowtest@example.com", "password": "FlowTest123"},
    )
    assert register_response.status_code == 201

    # 2. Login
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "flowtest@example.com", "password": "FlowTest123"},
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    refresh_token = login_response.json()["refresh_token"]

    # 3. Access protected endpoint
    me_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "flowtest@example.com"

    # 4. Refresh token
    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_response.status_code == 200
    new_access_token = refresh_response.json()["access_token"]
    new_refresh_token = refresh_response.json()["refresh_token"]
    # Refresh token should always be different (random string)
    assert new_refresh_token != refresh_token
    # Access token may be the same if issued in the same second (has same exp/iat)
    # But it should be valid and work
    assert new_access_token is not None

    # 5. Old refresh token should not work
    old_refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert old_refresh_response.status_code == 401

    # 6. Logout
    logout_response = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": new_refresh_token},
    )
    assert logout_response.status_code == 200
