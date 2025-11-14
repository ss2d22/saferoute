"""Rate limiting configuration."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

settings = get_settings()

# Create limiter instance
limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.RATE_LIMIT_ENABLED,
)


# Rate limit decorators for different endpoints
def rate_limit_auth_login():
    """Rate limit for login endpoint."""
    return f"{settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute"


def rate_limit_auth_register():
    """Rate limit for registration endpoint."""
    return "3/hour"


def rate_limit_routes_safe_anonymous():
    """Rate limit for anonymous route requests."""
    return f"{settings.RATE_LIMIT_PER_MINUTE}/minute"


def rate_limit_routes_safe_authenticated():
    """Rate limit for authenticated route requests."""
    return "120/minute"


def rate_limit_users():
    """Rate limit for user endpoints."""
    return "120/minute"
