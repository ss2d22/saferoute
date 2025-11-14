"""Integration tests for routes API."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.route import RouteHistory


@pytest.fixture
def mock_ors_response():
    """Mock OpenRouteService response."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-1.4044, 50.9097],
                        [-1.4172, 50.9114],
                        [-1.4300, 50.9130],
                    ],
                },
                "properties": {
                    "summary": {"distance": 2300, "duration": 1800},
                    "segments": [
                        {"steps": [{"distance": 150, "duration": 120, "instruction": "Head north"}]}
                    ],
                },
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-1.4044, 50.9097],
                        [-1.4150, 50.9100],
                        [-1.4300, 50.9130],
                    ],
                },
                "properties": {
                    "summary": {"distance": 2400, "duration": 1900},
                    "segments": [{"steps": []}],
                },
            },
        ],
    }


def test_get_routes_anonymous(client: TestClient, mock_ors_response):
    """Test getting routes without authentication."""
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
        assert "routes" in data
        assert len(data["routes"]) == 2
        assert data["routes"][0]["is_recommended"] is True
        assert data["routes"][0]["rank"] == 1
        assert data["routes"][1]["rank"] == 2


def test_get_routes_authenticated_saves_history(
    client: TestClient, auth_headers: dict, db: Session, mock_ors_response
):
    """Test that authenticated requests save to history."""
    with patch(
        "app.services.routing_service.RoutingService.get_directions", new_callable=AsyncMock
    ) as mock_ors:
        mock_ors.return_value = mock_ors_response

        # Get initial history count using defer to avoid geometry issues with SQLite
        from sqlalchemy.orm import defer

        query = db.query(RouteHistory).options(defer(RouteHistory.route_geom))
        initial_count = query.count()

        response = client.post(
            "/api/v1/routes/safe",
            json={
                "origin": {"lat": 50.9097, "lng": -1.4044},
                "destination": {"lat": 50.9130, "lng": -1.4300},
                "mode": "foot-walking",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200

        # Check history was saved
        final_count = query.count()
        assert final_count == initial_count + 1

        # Verify history details (defer geometry to avoid SQLite issues)
        history = (
            db.query(RouteHistory)
            .options(defer(RouteHistory.route_geom))
            .order_by(RouteHistory.created_at.desc())
            .first()
        )
        assert history.origin_lat == 50.9097
        assert history.origin_lng == -1.4044
        assert history.destination_lat == 50.9130
        assert history.destination_lng == -1.4300
        assert history.mode == "foot-walking"


def test_get_routes_with_preferences(client: TestClient, mock_ors_response):
    """Test getting routes with custom preferences."""
    with patch(
        "app.services.routing_service.RoutingService.get_directions", new_callable=AsyncMock
    ) as mock_ors:
        mock_ors.return_value = mock_ors_response

        response = client.post(
            "/api/v1/routes/safe",
            json={
                "origin": {"lat": 50.9097, "lng": -1.4044},
                "destination": {"lat": 50.9130, "lng": -1.4300},
                "mode": "cycling-regular",
                "preferences": {
                    "safety_weight": 0.9,
                    "lookback_months": 6,
                    "time_of_day_sensitive": True,
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["routes"]) == 2


def test_get_routes_invalid_coordinates(client: TestClient):
    """Test with invalid coordinates."""
    response = client.post(
        "/api/v1/routes/safe",
        json={
            "origin": {"lat": 999, "lng": -1.4044},  # Invalid latitude
            "destination": {"lat": 50.9130, "lng": -1.4300},
            "mode": "foot-walking",
        },
    )

    assert response.status_code == 422


def test_get_routes_ors_error(client: TestClient):
    """Test handling of ORS API errors."""
    with patch(
        "app.services.routing_service.RoutingService.get_directions", new_callable=AsyncMock
    ) as mock_ors:
        mock_ors.side_effect = Exception("ORS API Error")

        response = client.post(
            "/api/v1/routes/safe",
            json={
                "origin": {"lat": 50.9097, "lng": -1.4044},
                "destination": {"lat": 50.9130, "lng": -1.4300},
                "mode": "foot-walking",
            },
        )

        assert response.status_code == 500
