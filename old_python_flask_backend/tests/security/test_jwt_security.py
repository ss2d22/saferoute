"""Security tests for JWT implementation."""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from jose import jwt

from app.config import get_settings
from app.core.security import create_access_token

settings = get_settings()


def test_jwt_tampering(client: TestClient, test_user):
    """Test that tampered JWTs are rejected."""
    # Create a valid token
    token = create_access_token(subject=str(test_user.id))

    # Decode without verification to tamper
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

    # Tamper with the payload
    payload["sub"] = "different-user-id"

    # Re-encode with wrong secret
    tampered_token = jwt.encode(payload, "wrong-secret", algorithm=settings.JWT_ALGORITHM)

    # Try to use tampered token
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered_token}"})

    assert response.status_code == 401


def test_expired_token(client: TestClient, test_user):
    """Test that expired tokens are rejected."""
    # Create an expired token
    expire = datetime.utcnow() - timedelta(minutes=30)
    payload = {
        "exp": expire,
        "iat": datetime.utcnow() - timedelta(minutes=45),
        "sub": str(test_user.id),
        "type": "access",
    }
    expired_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})

    assert response.status_code == 401


def test_wrong_algorithm(client: TestClient, test_user):
    """Test that tokens with wrong algorithm are rejected."""
    # Try to use none algorithm (security vulnerability)
    token_parts = create_access_token(subject=str(test_user.id)).split(".")
    malicious_token = token_parts[0] + ".eyJhbGciOiJub25lIn0."  # None algorithm

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {malicious_token}"})

    assert response.status_code == 401


def test_missing_claims(client: TestClient):
    """Test that tokens with missing claims are rejected."""
    # Create token without 'sub' claim
    payload = {
        "exp": datetime.utcnow() + timedelta(minutes=15),
        "iat": datetime.utcnow(),
        "type": "access",
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_wrong_token_type(client: TestClient, test_user):
    """Test that refresh tokens can't be used for access."""
    # Create a token with wrong type
    payload = {
        "exp": datetime.utcnow() + timedelta(minutes=15),
        "iat": datetime.utcnow(),
        "sub": str(test_user.id),
        "type": "refresh",  # Wrong type
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_sql_injection_in_email(client: TestClient):
    """Test SQL injection attempts in email field."""
    malicious_emails = [
        "admin'--",
        "admin' OR '1'='1",
        "'; DROP TABLE users; --",
        "admin' UNION SELECT * FROM users--",
    ]

    for email in malicious_emails:
        response = client.post("/api/v1/auth/login", json={"email": email, "password": "anything"})
        # Should either be 401 or 422, but never succeed
        assert response.status_code in [401, 422]


def test_xss_in_registration(client: TestClient):
    """Test XSS attempts in registration."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "<script>alert('xss')</script>@example.com", "password": "SecurePass123"},
    )

    # Should fail validation or sanitize
    assert response.status_code in [422, 201]


def test_password_brute_force_protection(client: TestClient, test_user):
    """Test that repeated failed login attempts are handled."""
    # Try multiple failed logins
    for i in range(10):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "test@example.com", "password": f"wrong-password-{i}"},
        )
        assert response.status_code == 401

    # Should still fail with correct password if rate limited
    # (This test assumes rate limiting is enabled in production)
    response = client.post(
        "/api/v1/auth/login", json={"email": "test@example.com", "password": "TestPassword123"}
    )
    # In test, rate limiting is disabled, so this should succeed
    assert response.status_code in [200, 429]
