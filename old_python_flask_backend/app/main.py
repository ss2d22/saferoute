"""SafeRoute API - FastAPI application entry point.

Safety-aware routing system for Southampton combining route planning with
crime data analysis using H3 hexagonal spatial indexing.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1 import admin, auth, routes, safety, users
from app.config import get_settings
from app.core.exceptions import SafeRouteException
from app.core.logging_config import get_logger, setup_logging
from app.core.middleware import MetricsMiddleware, RequestLoggingMiddleware
from app.core.rate_limit import limiter


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan events."""
    # Startup
    settings = get_settings()
    setup_logging()
    logger = get_logger(__name__)
    logger.info(f"Starting SafeRoute API in {settings.APP_ENV} mode")
    yield
    # Shutdown
    logger.info("Shutting down SafeRoute API")


# Create FastAPI application
app = FastAPI(
    title="SafeRoute API",
    description="""SafeRoute finds safer routes through Southampton by analyzing UK Police crime data.

Features: Safety heatmaps with crime risk visualization, multiple route alternatives ranked by safety score, historical crime analytics with time-of-day weighting, Redis caching, and automated monthly data updates.

Data sources: UK Police API for crime data, OpenRouteService for routing, H3 hexagonal spatial indexing for efficient geographic queries.

Authentication is optional. Authenticated users get route history tracking, custom preferences, and higher rate limits. Use /auth/login to obtain a JWT access token.
    """,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    contact={
        "name": "SafeRoute API Support",
        "url": "https://github.com/ss2d22/saferoute",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
    openapi_tags=[
        {
            "name": "health",
            "description": "Health and readiness checks",
        },
        {
            "name": "safety",
            "description": "Safety heatmaps and crime statistics",
        },
        {
            "name": "routes",
            "description": "Safety-scored route planning",
        },
        {
            "name": "auth",
            "description": "Authentication and tokens",
        },
        {
            "name": "users",
            "description": "User settings and history",
        },
        {
            "name": "admin",
            "description": "Background task management",
        },
        {
            "name": "tasks",
            "description": "Celery task status",
        },
    ],
)

# Get settings
settings = get_settings()

# Add rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add metrics middleware (must be added before request logging for accurate timing)
metrics_middleware = MetricsMiddleware(app)
app.add_middleware(MetricsMiddleware)

# Add request logging middleware
app.add_middleware(RequestLoggingMiddleware)

# Add CORS middleware (added last, executes first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store metrics middleware reference for metrics endpoint
app.state.metrics_middleware = metrics_middleware


# Global exception handler for custom exceptions
@app.exception_handler(SafeRouteException)
async def saferoute_exception_handler(request: Request, exc: SafeRouteException):
    """Handle SafeRoute custom exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "path": request.url.path,
        },
    )


# Health check endpoints
@app.get("/health", tags=["health"])
async def health_check():
    """Basic liveness check."""
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
async def readiness_check():
    """Readiness check (includes DB connection check)."""
    # TODO: Add DB connection check
    return {"status": "ready", "database": "ok"}


@app.get("/metrics", tags=["health"])
async def get_metrics(request: Request):
    """Get application metrics.

    Returns request counts, response times, and status codes.
    """
    metrics_middleware = request.app.state.metrics_middleware
    return metrics_middleware.get_metrics()


# Include API routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(routes.router, prefix="/api/v1/routes", tags=["routes"])
app.include_router(safety.router, prefix="/api/v1/safety", tags=["safety"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
