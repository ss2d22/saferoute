"""Integration tests for user endpoints."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User


def test_get_user_settings(client: TestClient, auth_headers: dict):
    """Test getting user settings."""
    response = client.get("/api/v1/users/me/settings", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert "history_enabled" in data
    assert "history_retention_days" in data
    assert "default_safety_weight" in data


def test_update_user_settings(client: TestClient, auth_headers: dict, db: Session):
    """Test updating user settings."""
    response = client.patch(
        "/api/v1/users/me/settings",
        headers=auth_headers,
        json={"history_enabled": False, "history_retention_days": 30, "default_safety_weight": 0.9},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["history_enabled"] is False
    assert data["history_retention_days"] == 30
    assert data["default_safety_weight"] == 0.9


def test_get_empty_history(client: TestClient, auth_headers: dict):
    """Test getting history when empty."""
    response = client.get("/api/v1/users/me/history", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_get_history_with_items(
    client: TestClient, auth_headers: dict, test_user: User, db: Session
):
    """Test getting history with items."""
    # Create some history items using repository (handles SQLite geometry issues)
    from app.repositories.route_repository import RouteRepository

    repo = RouteRepository(db)

    for i in range(3):
        repo.create_history(
            user_id=test_user.id,
            origin_lat=50.9097 + i * 0.001,
            origin_lng=-1.4044,
            destination_lat=50.9130,
            destination_lng=-1.4300,
            mode="foot-walking",
            safety_score_best=85.0,
            distance_m_best=2300,
            duration_s_best=1800,
            request_meta={},
        )

    response = client.get("/api/v1/users/me/history", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 3
    assert data["total"] == 3


def test_get_history_pagination(
    client: TestClient, auth_headers: dict, test_user: User, db: Session
):
    """Test history pagination."""
    # Create 25 history items using repository
    from app.repositories.route_repository import RouteRepository

    repo = RouteRepository(db)

    for i in range(25):
        repo.create_history(
            user_id=test_user.id,
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

    # Get first page
    response = client.get("/api/v1/users/me/history?limit=10&offset=0", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 10
    assert data["total"] == 25
    assert data["limit"] == 10
    assert data["offset"] == 0

    # Get second page
    response = client.get("/api/v1/users/me/history?limit=10&offset=10", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 10
    assert data["total"] == 25


def test_delete_single_history_item(
    client: TestClient, auth_headers: dict, test_user: User, db: Session
):
    """Test deleting a single history item."""
    # Create history item using repository
    from app.repositories.route_repository import RouteRepository

    repo = RouteRepository(db)

    history = repo.create_history(
        user_id=test_user.id,
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

    # Delete it
    response = client.delete(f"/api/v1/users/me/history/{history.id}", headers=auth_headers)

    assert response.status_code == 200

    # Verify it's soft deleted by querying it again
    deleted_history = repo.get_history_by_id(history.id, test_user.id)
    # Should not be found since it's soft deleted (deleted_at is not None)
    assert deleted_history is None


def test_delete_all_history(client: TestClient, auth_headers: dict, test_user: User, db: Session):
    """Test deleting all history."""
    # Create multiple history items using repository
    from app.repositories.route_repository import RouteRepository

    repo = RouteRepository(db)

    for i in range(5):
        repo.create_history(
            user_id=test_user.id,
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

    response = client.delete("/api/v1/users/me/history", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["deleted_count"] == 5

    # Verify history is empty
    response = client.get("/api/v1/users/me/history", headers=auth_headers)
    data = response.json()
    assert data["total"] == 0


def test_delete_account(client: TestClient, auth_headers: dict, test_user: User, db: Session):
    """Test account deletion."""
    # TestClient.delete() doesn't support content or json params, use request() instead
    response = client.request(
        "DELETE", "/api/v1/users/me", headers=auth_headers, json={"password": "TestPassword123"}
    )

    assert response.status_code == 200

    # Verify user is deleted
    user = db.query(User).filter(User.id == test_user.id).first()
    assert user is None


def test_delete_account_wrong_password(client: TestClient, auth_headers: dict):
    """Test account deletion with wrong password."""
    # TestClient.delete() doesn't support content or json params, use request() instead
    response = client.request(
        "DELETE", "/api/v1/users/me", headers=auth_headers, json={"password": "WrongPassword"}
    )

    assert response.status_code == 401
