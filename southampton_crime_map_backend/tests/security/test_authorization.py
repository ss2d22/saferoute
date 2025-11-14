"""Security tests for authorization."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User


def test_user_cannot_access_other_user_history(client: TestClient, db: Session):
    """Test that users cannot access other users' history."""
    # Create two users
    from app.core.security import hash_password

    user1 = User(
        email="user1@example.com",
        hashed_password=hash_password("Password123"),
        is_active=True,
    )
    user2 = User(
        email="user2@example.com",
        hashed_password=hash_password("Password123"),
        is_active=True,
    )
    db.add(user1)
    db.add(user2)
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    # Create history for user2 using repository
    from app.repositories.route_repository import RouteRepository

    repo = RouteRepository(db)

    history = repo.create_history(
        user_id=user2.id,
        origin_lat=50.9097,
        origin_lng=-1.4044,
        destination_lat=50.9130,
        destination_lng=-1.4300,
        mode="foot-walking",
        safety_score_best=85.0,
        distance_m_best=2300,
        duration_s_best=1800,
        request_meta={},
    )

    # Login as user1
    login_response = client.post(
        "/api/v1/auth/login", json={"email": "user1@example.com", "password": "Password123"}
    )
    user1_token = login_response.json()["access_token"]

    # Try to delete user2's history
    response = client.delete(
        f"/api/v1/users/me/history/{history.id}", headers={"Authorization": f"Bearer {user1_token}"}
    )

    # Should fail because user1 doesn't own this history
    assert response.status_code == 404


def test_user_cannot_update_other_user_settings(client: TestClient, db: Session):
    """Test that users can only update their own settings."""
    from app.core.security import hash_password

    user1 = User(
        email="user1@example.com",
        hashed_password=hash_password("Password123"),
        is_active=True,
    )
    user2 = User(
        email="user2@example.com",
        hashed_password=hash_password("Password123"),
        is_active=True,
    )
    db.add(user1)
    db.add(user2)
    db.commit()

    # Login as user1
    login_response = client.post(
        "/api/v1/auth/login", json={"email": "user1@example.com", "password": "Password123"}
    )
    user1_token = login_response.json()["access_token"]

    # Update settings should only affect user1
    response = client.patch(
        "/api/v1/users/me/settings",
        headers={"Authorization": f"Bearer {user1_token}"},
        json={"history_enabled": False},
    )

    assert response.status_code == 200

    # Verify user2's settings weren't changed
    db.refresh(user2)
    assert user2.settings.get("history_enabled", True) is True


def test_inactive_user_cannot_access_endpoints(client: TestClient, db: Session):
    """Test that inactive users cannot access protected endpoints."""
    from app.core.security import create_access_token, hash_password

    # Create inactive user
    user = User(
        email="inactive@example.com",
        hashed_password=hash_password("Password123"),
        is_active=False,  # Inactive
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Manually create a token for inactive user
    token = create_access_token(subject=str(user.id))

    # Try to access protected endpoint
    response = client.get("/api/v1/users/me/history", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


def test_deleted_account_cannot_be_accessed(client: TestClient, db: Session):
    """Test that deleted accounts cannot be accessed."""
    from app.core.security import hash_password

    # Create and then delete user
    user = User(
        email="todelete@example.com",
        hashed_password=hash_password("Password123"),
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Login
    login_response = client.post(
        "/api/v1/auth/login", json={"email": "todelete@example.com", "password": "Password123"}
    )
    token = login_response.json()["access_token"]

    # Delete account (use request() since delete() doesn't support json param)
    delete_response = client.request(
        "DELETE",
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"password": "Password123"},
    )
    assert delete_response.status_code == 200

    # Try to access with old token
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
