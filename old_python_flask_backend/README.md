# SafeRoute - Safety-Aware Routing for Southampton

A sophisticated routing system that combines real-time route planning with historical crime data analysis to provide safety-aware navigation in Southampton, UK.

## Overview

SafeRoute is a FastAPI-based web application that helps users find safer routes by analyzing historical crime data from the UK Police API. The system uses H3 hexagonal spatial indexing for efficient crime data aggregation and provides multiple route alternatives ranked by safety scores.

### Key Features

- **H3 Hexagonal Spatial Indexing**: Uses Uber's H3 system (Resolution 10: ~73m edge cells) for efficient spatial analysis
- **Real-Time Route Planning**: Integration with OpenRouteService for multiple routing profiles (walking, cycling, driving)
- **Safety Scoring**: Time-weighted and recency-weighted crime data analysis
- **Time-of-Day Awareness**: Crime pattern adjustments based on time of day
- **Background Processing**: Celery-based automated crime data ingestion and grid rebuilding
- **Caching Layer**: Redis-based caching for improved performance
- **User Authentication**: JWT-based auth with route history tracking
- **RESTful API**: Comprehensive REST API with OpenAPI documentation

## Architecture

The system uses a layered architecture with clear separation of concerns:
- API layer handles HTTP requests and authentication
- Services contain business logic for safety scoring and route calculation
- Repositories manage database queries
- Background workers handle periodic data ingestion via Celery

## Technology Stack

- **Backend**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 16 with PostGIS extension
- **Spatial Indexing**: H3 hexagonal indexing (Resolution 10)
- **Task Queue**: Celery with Redis broker
- **Caching**: Redis
- **ORM**: SQLAlchemy with GeoAlchemy2
- **Routing**: OpenRouteService API
- **Authentication**: JWT (python-jose)
- **Testing**: pytest with 149 passing tests
- **Code Quality**: ruff, mypy, black, isort

## Getting Started

### Prerequisites

- Python 3.11+
- PostgreSQL 16+ with PostGIS
- Redis
- Docker & Docker Compose (recommended)
- OpenRouteService API key

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/ss2d22/saferoute.git
   cd saferoute
   ```

2. **Install dependencies**

   ```bash
   make install-dev
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start services with Docker Compose**

   ```bash
   make dev-up
   ```

   This will:

   - Start PostgreSQL with PostGIS
   - Start Redis
   - Run database migrations
   - Start the FastAPI application

5. **Initialize the database**
   ```bash
   # Seed crime categories
   docker-compose exec app poetry run python -m app.ingestion.cli seed-categories
   ```

### Running the Application

**Development Mode:**

```bash
# Start all services (PostgreSQL, Redis, FastAPI)
make dev-up

# View application logs
make dev-logs

# Stop all services
make dev-down

# Open shell in app container
make dev-shell
```

**Run tests:**

```bash
make test          # Run all tests
make test-unit     # Run unit tests only
make test-cov      # Run tests with coverage report
```

**Code quality:**

```bash
make lint          # Run ruff and mypy
make format        # Format code with black and isort
```

## API Documentation

Once running, visit:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

### Key Endpoints

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/routes` - Get safe routes between two points
- `GET /api/v1/safety/snapshot` - Get safety heatmap data
- `GET /api/v1/users/me/history` - Get route history
- `POST /api/v1/admin/tasks/*` - Admin task management

## Project Structure

```
saferoute/
├── app/
│   ├── api/v1/          # REST API endpoints
│   │   ├── auth.py      # Authentication endpoints
│   │   ├── routes.py    # Route planning endpoints
│   │   ├── safety.py    # Safety heatmap endpoints
│   │   ├── users.py     # User management endpoints
│   │   └── admin.py     # Admin task endpoints
│   ├── core/            # Core utilities
│   │   ├── exceptions.py    # Custom exceptions
│   │   ├── logging_config.py # Logging configuration
│   │   ├── middleware.py     # FastAPI middleware
│   │   ├── rate_limit.py     # Rate limiting
│   │   └── security.py       # JWT and password hashing
│   ├── db/              # Database configuration
│   │   ├── base.py      # SQLAlchemy base and session
│   │   └── migrations/  # Alembic migrations
│   ├── ingestion/       # Crime data ingestion
│   │   ├── cli.py           # CLI for ingestion tasks
│   │   ├── crime_ingester.py # UK Police API ingestion
│   │   ├── grid_builder.py   # H3 grid builder
│   │   └── police_api.py     # Police API client
│   ├── models/          # SQLAlchemy models
│   │   ├── crime.py     # Crime and category models
│   │   ├── route.py     # Route history models
│   │   └── user.py      # User models
│   ├── repositories/    # Data access layer
│   │   ├── crime_repository.py
│   │   ├── route_repository.py
│   │   └── user_repository.py
│   ├── schemas/         # Pydantic schemas
│   │   ├── auth.py      # Authentication schemas
│   │   ├── route.py     # Route schemas
│   │   ├── safety.py    # Safety snapshot schemas
│   │   └── user.py      # User schemas
│   ├── services/        # Business logic
│   │   ├── auth_service.py    # Authentication service
│   │   ├── cache_service.py   # Redis caching
│   │   ├── history_service.py # Route history
│   │   ├── route_safety_service.py # Route safety scoring
│   │   ├── routing_service.py      # ORS integration
│   │   ├── safety_service.py       # Safety analysis
│   │   └── user_service.py         # User management
│   ├── tasks/           # Celery background tasks
│   │   └── ingestion_tasks.py # Crime ingestion, grid building
│   ├── utils/           # Utility functions
│   │   ├── geometry.py      # Geometry transformations
│   │   ├── scoring.py       # Safety scoring utilities
│   │   └── segmentation.py  # Route segmentation
│   ├── celery_app.py    # Celery configuration
│   ├── config.py        # Application configuration
│   ├── dependencies.py  # FastAPI dependencies
│   └── main.py          # FastAPI application entry point
├── docs/                # Documentation
│   ├── CELERY_SETUP.md           # Celery setup guide
│   ├── SCORING_ALGORITHM.md      # Scoring algo explanation
│   └── openapi.json              # OpenAPI specification
├── scripts/             # Utility scripts
│   ├── celery_beat.sh   # Celery Beat startup script
│   ├── celery_worker.sh # Celery Worker startup script
│   ├── init_db.py       # Database initialization
│   ├── retention_job.py # Route history cleanup
│   ├── test-live.sh     # Live integration tests
│   └── verify-setup.sh  # Setup verification
├── tests/               # Test suite
│   ├── e2e/            # End-to-end tests
│   ├── integration/    # Integration tests
│   ├── security/       # Security tests
│   ├── unit/           # Unit tests
│   └── conftest.py     # Pytest configuration
├── docker/              # Docker configuration
│   └── Dockerfile      # Application Dockerfile
├── alembic.ini         # Alembic configuration
├── docker-compose.yml  # Docker Compose configuration
├── Makefile            # Common commands
├── poetry.lock         # Poetry lock file
├── pyproject.toml      # Python dependencies
├── pytest.ini          # Pytest configuration
└── README.md           # This file
```

## H3 Hexagonal Grid System

SafeRoute uses Uber's H3 hexagonal indexing system at Resolution 10:

- **Cell Edge Length**: ~73 meters
- **Benefits**:
  - Uniform cell coverage across the area
  - Efficient spatial queries and joins
  - Better geometric properties than square grids
  - Hierarchical aggregation across resolutions (planned for future release)

## Background Tasks (Celery)

Automated tasks for data maintenance:

1. **Crime Data Ingestion** (Monthly, 2nd @ 2 AM UTC)

   - Fetches latest crime data from UK Police API
   - Processes: thousands of crimes per month for Southampton
   - See [docs/CELERY_SETUP.md](docs/CELERY_SETUP.md)

2. **H3 Grid Rebuilding** (Monthly, 3rd @ 3 AM UTC)

   - Aggregates crimes into H3 hexagonal cells
   - Creates ~1,482 cells per month
   - Processes 12 months of historical data

3. **Route History Cleanup** (Weekly, Sunday @ 4 AM UTC)
   - Soft-deletes route history older than 90 days

## Makefile Commands

All common commands are available via `make`:

### Development

```bash
make dev-up          # Start all services in background
make dev-down        # Stop all services
make dev-logs        # View application logs
make dev-shell       # Open shell in app container
```

### Testing

```bash
make test            # Run all tests
make test-unit       # Run unit tests only
make test-integration # Run integration tests only
make test-e2e        # Run end-to-end tests
make test-cov        # Run tests with coverage report
make test-live       # Run live integration tests (requires running services)
```

### Code Quality

```bash
make lint            # Run ruff and mypy linters
make format          # Format code with black and isort
make type-check      # Run mypy type checking
make clean           # Remove cache and build artifacts
```

### Database

```bash
make migrate         # Create new migration
make migrate-up      # Apply migrations
make migrate-down    # Rollback last migration
make db-init         # Initialize database with extensions
make db-reset        # Reset database (WARNING: destroys data)
make db-shell        # Open PostgreSQL shell
```

### Data Ingestion

```bash
make ingest-crimes MONTH=2025-01  # Ingest crimes for specific month
make build-grid MONTHS=12         # Build safety grid for N months
make full-pipeline               # Run full ingestion pipeline
make retention                   # Run route history cleanup
```

### Installation

```bash
make install         # Install production dependencies
make install-dev     # Install development dependencies
```

### Documentation

```bash
make docs-openapi    # Export OpenAPI schema to docs/openapi.json
make docs-serve      # Start local docs server on port 8000
```

### Docker

```bash
make docker-build    # Build Docker image
make docker-push     # Push Docker image to registry
```

## Testing

```bash
# Run all tests
make test

# Run with coverage
make test-cov

# Run specific test types
make test-unit
make test-integration
make test-e2e

# Run live tests (requires running services)
make test-live
```

**Current Test Coverage**: 149 passing tests, 14 skipped (integration tests requiring live services)

## Configuration

Key environment variables (see `.env.example`):

```bash
# Database
DATABASE_URL=postgresql+psycopg2://saferoute:changeme@localhost:5432/saferoute

# Redis
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1

# External APIs
ORS_API_KEY=your_openrouteservice_api_key
POLICE_API_BASE_URL=https://data.police.uk/api

# H3 Grid Configuration
H3_RESOLUTION=10
GRID_CELL_SIZE_M=73
GRID_TYPE=h3_hexagonal
SOUTHAMPTON_BBOX=50.85,-1.55,51.0,-1.3

# Security
SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## Performance

Based on Southampton data (H3 Resolution 10):

- **API Response Time**: ~50-200ms (cached), ~500-1000ms (uncached)
- **Crime Ingestion**: Processes ~3,882 crimes per month
- **Grid Rebuilding**: 1 month (~1,482 cells) in under 10 seconds
- **Route Calculation**: ~300-800ms per request (with safety scoring)
- **Cache Hit Rate**: ~65-80% for safety snapshots

## Documentation

## Contributing

This is a small side project feel free to add. For questions or issues, please contact ss2d22@soton.ac.uk.

## License

MIT

## Acknowledgments

- **UK Police API** for crime data
- **OpenRouteService** for routing capabilities
- **Uber H3** for hexagonal spatial indexing

## References

- [UK Police API Documentation](https://data.police.uk/docs/)
- [H3 Hexagonal Indexing](https://h3geo.org/)
- [OpenRouteService API](https://openrouteservice.org/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Celery Documentation](https://docs.celeryproject.org/)

---

**Version**: 1.0.0
**Status**: Active Development
