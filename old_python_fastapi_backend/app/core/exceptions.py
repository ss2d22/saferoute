"""Custom exception classes."""

from fastapi import HTTPException, status


class SafeRouteException(Exception):
    """Base exception for SafeRoute application."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class AuthenticationError(SafeRouteException):
    """Authentication failed."""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class AuthorizationError(SafeRouteException):
    """Authorization failed."""

    def __init__(self, message: str = "Not authorized"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


class NotFoundError(SafeRouteException):
    """Resource not found."""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class ValidationError(SafeRouteException):
    """Validation error."""

    def __init__(self, message: str = "Validation failed"):
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)


class ConflictError(SafeRouteException):
    """Resource conflict (e.g., duplicate email)."""

    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message, status.HTTP_409_CONFLICT)


class ExternalServiceError(SafeRouteException):
    """External service (ORS, Police API) error."""

    def __init__(self, message: str = "External service unavailable"):
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE)


class RateLimitExceeded(SafeRouteException):
    """Rate limit exceeded."""

    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message, status.HTTP_429_TOO_MANY_REQUESTS)


def credentials_exception() -> HTTPException:
    """Create credentials exception for JWT validation."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def inactive_user_exception() -> HTTPException:
    """Create inactive user exception."""
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Inactive user",
    )
