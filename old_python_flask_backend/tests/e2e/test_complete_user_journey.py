"""End-to-end test for complete user journey."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


@pytest.fixture
def mock_ors_response():
    """Mock ORS response for E2E tests."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-1.4044, 50.9097], [-1.4300, 50.9130]],
                },
                "properties": {
                    "summary": {"distance": 2300, "duration": 1800},
                    "segments": [{"steps": []}],
                },
            }
        ],
    }


def test_complete_user_journey(client: TestClient, db: Session, mock_ors_response):
    """Test complete user journey from registration to account deletion."""

    # 1. User registers
    register_response = client.post(
        "/api/v1/auth/register", json={"email": "journey@example.com", "password": "JourneyPass123"}
    )
    assert register_response.status_code == 201
    user_data = register_response.json()
    assert user_data["email"] == "journey@example.com"

    # 2. User logs in
    login_response = client.post(
        "/api/v1/auth/login", json={"email": "journey@example.com", "password": "JourneyPass123"}
    )
    assert login_response.status_code == 200
    tokens = login_response.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 3. User checks their profile
    me_response = client.get("/api/v1/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "journey@example.com"

    # 4. User updates their settings
    settings_response = client.patch(
        "/api/v1/users/me/settings",
        headers=headers,
        json={"history_enabled": True, "default_safety_weight": 0.85},
    )
    assert settings_response.status_code == 200
    settings = settings_response.json()
    assert settings["history_enabled"] is True
    assert settings["default_safety_weight"] == 0.85

    # 5. User requests a safe route (multiple times)
    with patch(
        "app.services.routing_service.RoutingService.get_directions", new_callable=AsyncMock
    ) as mock_ors:
        mock_ors.return_value = mock_ors_response

        for i in range(3):
            route_response = client.post(
                "/api/v1/routes/safe",
                headers=headers,
                json={
                    "origin": {"lat": 50.9097 + i * 0.001, "lng": -1.4044},
                    "destination": {"lat": 50.9130, "lng": -1.4300},
                    "mode": "foot-walking",
                },
            )
            assert route_response.status_code == 200
            routes = route_response.json()["routes"]
            assert len(routes) >= 1

    # 6. User checks their history
    history_response = client.get("/api/v1/users/me/history", headers=headers)
    assert history_response.status_code == 200
    history = history_response.json()
    assert history["total"] == 3
    assert len(history["items"]) == 3

    # 7. User deletes one history item
    first_item_id = history["items"][0]["id"]
    delete_item_response = client.delete(
        f"/api/v1/users/me/history/{first_item_id}", headers=headers
    )
    assert delete_item_response.status_code == 200

    # 8. User checks history again
    history_response2 = client.get("/api/v1/users/me/history", headers=headers)
    assert history_response2.status_code == 200
    assert history_response2.json()["total"] == 2

    # 9. User refreshes their token
    refresh_response = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()
    new_access_token = new_tokens["access_token"]
    new_refresh_token = new_tokens["refresh_token"]
    # Refresh token should always be different (random string)
    assert new_refresh_token != refresh_token
    # Access token may be the same if issued in the same second (has same exp/iat)
    # But it should be valid and work
    assert new_access_token is not None

    # 10. User uses new token
    new_headers = {"Authorization": f"Bearer {new_access_token}"}
    me_response2 = client.get("/api/v1/auth/me", headers=new_headers)
    assert me_response2.status_code == 200

    # 11. User deletes all history
    delete_all_response = client.delete("/api/v1/users/me/history", headers=new_headers)
    assert delete_all_response.status_code == 200
    assert delete_all_response.json()["deleted_count"] == 2

    # 12. Verify history is empty
    history_response3 = client.get("/api/v1/users/me/history", headers=new_headers)
    assert history_response3.status_code == 200
    assert history_response3.json()["total"] == 0

    # 13. User deletes their account
    # Note: TestClient.delete() doesn't support json parameter, use request() instead
    delete_account_response = client.request(
        "DELETE", "/api/v1/users/me", headers=new_headers, json={"password": "JourneyPass123"}
    )
    assert delete_account_response.status_code == 200

    # 14. Verify user cannot login anymore
    login_attempt = client.post(
        "/api/v1/auth/login", json={"email": "journey@example.com", "password": "JourneyPass123"}
    )
    assert login_attempt.status_code == 401

    # 15. Verify token no longer works
    final_me_response = client.get("/api/v1/auth/me", headers=new_headers)
    assert final_me_response.status_code == 401


def test_anonymous_user_can_get_routes(client: TestClient, mock_ors_response):
    """Test that anonymous users can get routes without authentication."""
    with patch(
        "app.services.routing_service.RoutingService.get_directions", new_callable=AsyncMock
    ) as mock_ors:
        mock_ors.return_value = mock_ors_response

        response = client.post(
            "/api/v1/routes/safe",
            json={
                "origin": {"lat": 50.9097, "lng": -1.4044},
                "destination": {"lat": 50.9130, "lng": -1.4300},
                "mode": "foot-walking",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["routes"]) >= 1


def test_safety_snapshot_endpoint(client: TestClient):
    """Test safety snapshot endpoint."""
    # bbox format: min_lng,min_lat,max_lng,max_lat
    response = client.get("/api/v1/safety/snapshot?bbox=-1.55,50.85,-1.3,51.0&lookback_months=12")

    if response.status_code != 200:
        print(f"Error response: {response.text}")
    assert response.status_code == 200
    data = response.json()
    assert "cells" in data
    assert "summary" in data
    assert "meta" in data

    # Check summary structure
    summary = data["summary"]
    assert "total_cells" in summary
    assert "total_crimes" in summary
    assert "avg_safety_score" in summary
    assert isinstance(summary["total_cells"], int)
    assert isinstance(summary["total_crimes"], int)
    assert 0 <= summary["avg_safety_score"] <= 100

    # Check meta structure
    meta = data["meta"]
    assert "bbox" in meta
    assert "cell_size_m" in meta
    assert "lookback_months" in meta
    assert meta["lookback_months"] == 12

    # Check cells structure (if any exist)
    if data["cells"]:
        cell = data["cells"][0]
        assert "id" in cell
        assert "safety_score" in cell
        assert "risk_score" in cell
        assert "crime_count" in cell
        assert "crime_breakdown" in cell
        assert 0 <= cell["safety_score"] <= 100
        assert 0 <= cell["risk_score"] <= 1
