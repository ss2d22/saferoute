"""Middleware for request logging, correlation IDs, and metrics."""

import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.logging_config import clear_request_id, get_logger, set_request_id

logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging HTTP requests with correlation IDs."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log request and response with timing and correlation ID.

        Args:
            request: Incoming HTTP request
            call_next: Next middleware or route handler

        Returns:
            HTTP response
        """
        # Generate or extract correlation ID
        correlation_id = request.headers.get("X-Request-ID")
        if not correlation_id:
            correlation_id = set_request_id()
        else:
            set_request_id(correlation_id)

        # Start timer
        start_time = time.time()

        # Log incoming request
        logger.info(
            "Request started",
            extra={
                "extra_fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "query_params": dict(request.query_params),
                    "client_ip": request.client.host if request.client else None,
                    "user_agent": request.headers.get("user-agent"),
                }
            },
        )

        # Process request
        try:
            response = await call_next(request)

            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000

            # Log response
            logger.info(
                "Request completed",
                extra={
                    "extra_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "duration_ms": round(duration_ms, 2),
                    }
                },
            )

            # Add correlation ID to response headers
            response.headers["X-Request-ID"] = correlation_id
            response.headers["X-Response-Time"] = f"{round(duration_ms, 2)}ms"

            return response

        except Exception as e:
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000

            # Log error
            logger.error(
                "Request failed",
                extra={
                    "extra_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "duration_ms": round(duration_ms, 2),
                        "error": str(e),
                        "error_type": type(e).__name__,
                    }
                },
                exc_info=True,
            )

            raise

        finally:
            # Clear correlation ID from context
            clear_request_id()


class MetricsMiddleware(BaseHTTPMiddleware):
    """Middleware for collecting request metrics.

    Tracks:
    - Request count by endpoint and method
    - Response status codes
    - Request duration
    - Active requests
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self._metrics = {
            "requests_total": 0,
            "requests_in_progress": 0,
            "requests_by_endpoint": {},
            "requests_by_status": {},
            "total_duration_seconds": 0.0,
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Track request metrics.

        Args:
            request: Incoming HTTP request
            call_next: Next middleware or route handler

        Returns:
            HTTP response
        """
        # Increment active requests
        self._metrics["requests_in_progress"] += 1

        # Start timer
        start_time = time.time()

        try:
            response = await call_next(request)

            # Track metrics
            duration = time.time() - start_time
            endpoint = f"{request.method} {request.url.path}"

            self._metrics["requests_total"] += 1
            self._metrics["total_duration_seconds"] += duration

            # Track by endpoint
            if endpoint not in self._metrics["requests_by_endpoint"]:
                self._metrics["requests_by_endpoint"][endpoint] = {
                    "count": 0,
                    "total_duration": 0.0,
                }
            self._metrics["requests_by_endpoint"][endpoint]["count"] += 1
            self._metrics["requests_by_endpoint"][endpoint]["total_duration"] += duration

            # Track by status code
            status_code = response.status_code
            if status_code not in self._metrics["requests_by_status"]:
                self._metrics["requests_by_status"][status_code] = 0
            self._metrics["requests_by_status"][status_code] += 1

            return response

        finally:
            # Decrement active requests
            self._metrics["requests_in_progress"] -= 1

    def get_metrics(self) -> dict:
        """Get current metrics.

        Returns:
            Dictionary of metrics
        """
        # Calculate average duration
        avg_duration = 0.0
        if self._metrics["requests_total"] > 0:
            avg_duration = self._metrics["total_duration_seconds"] / self._metrics["requests_total"]

        # Calculate per-endpoint averages
        endpoints = {}
        for endpoint, data in self._metrics["requests_by_endpoint"].items():
            avg_endpoint_duration = 0.0
            if data["count"] > 0:
                avg_endpoint_duration = data["total_duration"] / data["count"]

            endpoints[endpoint] = {
                "count": data["count"],
                "avg_duration_seconds": round(avg_endpoint_duration, 4),
            }

        return {
            "requests_total": self._metrics["requests_total"],
            "requests_in_progress": self._metrics["requests_in_progress"],
            "avg_duration_seconds": round(avg_duration, 4),
            "requests_by_endpoint": endpoints,
            "requests_by_status": self._metrics["requests_by_status"],
        }
