# Celery Background Jobs Setup

This document explains how to set up and use Celery for automated background tasks in SafeRoute.

## Overview

SafeRoute uses Celery for background processing with **H3 hexagonal spatial indexing**:

**Scheduled Tasks:**
- **Automated crime data ingestion** (monthly) - Fetches latest UK Police API data
- **H3 hexagonal safety grid rebuilding** (monthly) - Aggregates crimes into H3 cells (Resolution 10: ~73m edge)
- **Route history cleanup** (weekly) - Soft-deletes old user route history

**On-Demand Tasks:**
- Manual crime data ingestion for specific months
- Grid rebuilding with custom parameters
- H3 grid health checks and validation

**Key Features:**
- H3 hexagonal spatial indexing (Resolution 10)
- Automatic cache invalidation after data updates
- Comprehensive task monitoring and logging
- Database session management per task

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   FastAPI   │─────▶│   Redis     │◀─────│   Celery    │
│  (Web API)  │      │  (Broker)   │      │   Worker    │
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                            │
                     ┌──────▼──────┐
                     │   Celery    │
                     │    Beat     │
                     │ (Scheduler) │
                     └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │ PostgreSQL  │
                     │  + PostGIS  │
                     │ (H3 Grid)   │
                     └─────────────┘
```

## Prerequisites

1. **Redis**: Must be running (used as message broker and result backend)
2. **PostgreSQL + PostGIS**: Database with spatial extensions
3. **Celery**: Installed via `poetry install`
4. **H3**: Python library for hexagonal indexing (`h3` package)

## Installation

1. Install Celery (already included in pyproject.toml):
```bash
poetry install
```

2. Ensure Redis is running:
```bash
# Via Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or via docker-compose (recommended)
docker-compose up -d redis

# Or via Homebrew (macOS)
brew services start redis
```

3. Verify H3 library:
```bash
poetry run python -c "import h3; print(f'H3 version: {h3.__version__}')"
```

## Running Celery

### Development Mode

**Terminal 1 - Celery Worker:**
```bash
./scripts/celery_worker.sh
```

**Terminal 2 - Celery Beat (Scheduler):**
```bash
./scripts/celery_beat.sh
```

**Terminal 3 - FastAPI (Web API):**
```bash
poetry run uvicorn app.main:app --reload
```

### Production Mode

```bash
# Set environment
export APP_ENV=production

# Start worker
./scripts/celery_worker.sh &

# Start scheduler
./scripts/celery_beat.sh &

# Start web API
poetry run gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

## Available Tasks

### 1. Ingest Latest Crime Data

**Task:** `app.tasks.ingestion_tasks.ingest_latest_crime_data`
**Schedule:** 2nd of each month at 2:00 AM UTC
**Queue:** `ingestion`

**Description:** Automatically fetches the latest month of crime data from UK Police API.

**What it does:**
- Checks for latest available data (UK Police API has 1-2 month lag)
- Fetches crimes for Southampton area in tiles
- Normalizes and stores crime incidents in database
- Invalidates safety snapshot cache

**Manual trigger:**
```bash
curl -X POST http://localhost:8000/api/v1/admin/tasks/ingest-latest
```

### 2. Rebuild H3 Safety Grid

**Task:** `app.tasks.ingestion_tasks.rebuild_safety_grid`
**Schedule:** 3rd of each month at 3:00 AM UTC
**Queue:** `ingestion`

**Description:** Aggregates crime data into H3 hexagonal safety cells.

**Parameters:**
- `months` (int): Number of months to process (default: 12)

**What it does:**
- Converts crime locations to H3 cell IDs (Resolution 10)
- Aggregates crimes by H3 cell and month
- Calculates weighted crime counts (using harm weights)
- Generates crime breakdowns by category
- Creates hexagonal polygon geometries
- Invalidates safety snapshot cache

**H3 Grid Details:**
- Resolution: 10
- Cell edge length: ~73m
- Cell area: ~13,781 m²
- Grid type: Hexagonal (better coverage than square grids)

**Manual trigger:**
```bash
# Rebuild with default 12 months
curl -X POST "http://localhost:8000/api/v1/admin/tasks/rebuild-grid"

# Rebuild with custom months
curl -X POST "http://localhost:8000/api/v1/admin/tasks/rebuild-grid?months=6"
```

**Example Output:**
```json
{
  "task": "rebuild_safety_grid",
  "months_processed": 3,
  "cells_created": 1482,
  "grid_type": "h3_hexagonal",
  "h3_resolution": 10,
  "cell_size_m": 73,
  "statistics": {
    "unique_cells": 1482,
    "total_cell_months": 1482,
    "total_crimes": 3882,
    "avg_crimes_per_cell": 2.62,
    "max_crimes_per_cell": 54
  }
}
```

### 3. Cleanup Old Route History

**Task:** `app.tasks.ingestion_tasks.cleanup_old_route_history`
**Schedule:** Every Sunday at 4:00 AM UTC
**Queue:** `maintenance`

**Description:** Soft-deletes old user route history to manage database size.

**Parameters:**
- `retention_days` (int): Days to retain history (default: 90)

**Manual trigger:**
```bash
curl -X POST "http://localhost:8000/api/v1/admin/tasks/cleanup-history?retention_days=90"
```

### 4. Ingest Month On-Demand

**Task:** `app.tasks.ingestion_tasks.ingest_month_on_demand`
**Schedule:** Manual only

**Description:** Manually ingest crime data for a specific month.

**Parameters:**
- `year` (int): Year (e.g., 2024)
- `month` (int): Month (1-12)

**Manual trigger:**
```bash
curl -X POST http://localhost:8000/api/v1/admin/tasks/ingest-month \
  -H "Content-Type: application/json" \
  -d '{"year": 2024, "month": 9}'
```

### 5. Validate H3 Grid Health

**Task:** `app.tasks.ingestion_tasks.validate_h3_grid_health`
**Schedule:** Manual (run as needed)

**Description:** Comprehensive health check for H3 safety grid data integrity.

**What it validates:**
- H3 cell ID format and validity
- Monthly data coverage and gaps
- Crime statistics quality
- Data completeness

**Manual trigger:**
```bash
curl -X POST http://localhost:8000/api/v1/admin/tasks/validate-grid-health
```

**Example Output:**
```json
{
  "task": "validate_h3_grid_health",
  "timestamp": "2025-11-14T04:51:04.931895",
  "health_status": "degraded",
  "grid_info": {
    "resolution": 10,
    "cell_size_m": 73,
    "grid_type": "h3_hexagonal"
  },
  "h3_validation": {
    "total_cells": 1482,
    "unique_h3_cells": 1482,
    "invalid_cell_ids": 0
  },
  "coverage": {
    "months_analyzed": 1,
    "missing_months": ["2025-11-01", "2025-10-01"],
    "monthly_breakdown": [
      {"month": "2025-09-01", "cells": 1482, "crimes": 3882}
    ]
  },
  "data_quality": {
    "total_records": 1482,
    "zero_crime_cells": 0,
    "avg_crimes_per_cell": 2.62,
    "max_crimes_per_cell": 54
  },
  "issues": ["11 months missing data"]
}
```

**Health Status:**
- `healthy`: All checks passed
- `degraded`: Minor issues detected (missing months, invalid IDs)
- `warning`: Data quality concerns

## Celery CLI Commands

```bash
# List registered tasks (should show 5 tasks)
celery -A app.celery_app inspect registered

# Check active tasks
celery -A app.celery_app inspect active

# Check scheduled tasks
celery -A app.celery_app inspect scheduled

# View worker stats
celery -A app.celery_app inspect stats

# Purge all tasks (careful!)
celery -A app.celery_app purge
```

## Monitoring

### Flower (Celery Monitoring Tool)

Install Flower:
```bash
poetry add --group dev flower
```

Run Flower:
```bash
celery -A app.celery_app flower --port=5555
```

Access at: http://localhost:5555

### Celery Events

Monitor tasks in real-time:
```bash
celery -A app.celery_app events
```

## Task Configuration

### Worker Configuration
- **Concurrency**: 2 (dev) / 4 (prod)
- **Autoscale**: 1-4 (dev) / 2-8 (prod)
- **Max tasks per child**: 50 (dev) / 100 (prod)
- **Queues**: `ingestion`, `maintenance`

### Task Time Limits
- **Hard limit**: 1 hour (3600s)
- **Soft limit**: 55 minutes (3300s)

### Result Backend
- **Type**: Redis
- **TTL**: Results expire after task completion

## Troubleshooting

### Worker Not Processing Tasks

1. Check Redis connection:
```bash
redis-cli ping
```

2. Check worker logs:
```bash
celery -A app.celery_app inspect stats
```

3. Verify task registration:
```bash
celery -A app.celery_app inspect registered
```

### Tasks Failing

1. Check worker logs for errors
2. Verify database connection
3. Check UK Police API availability
4. Ensure Redis has sufficient memory

### Beat Schedule Not Running

1. Ensure only ONE beat instance is running
2. Check `celerybeat-schedule` file permissions
3. Verify timezone configuration (UTC)

## Environment Variables

Required in `.env`:
```bash
# Redis (Celery broker and result backend)
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1

# Database
DATABASE_URL=postgresql+psycopg2://saferoute:changeme@localhost:5432/saferoute

# UK Police API
POLICE_API_BASE_URL=https://data.police.uk/api

# H3 Grid Configuration
H3_RESOLUTION=10                    # Resolution 10: ~73m edge cells
GRID_CELL_SIZE_M=73
GRID_TYPE=h3_hexagonal
SOUTHAMPTON_BBOX=50.85,-1.55,51.0,-1.3

# Environment
APP_ENV=development                  # or 'production'
LOG_LEVEL=INFO                       # or 'WARNING' for production
```

## Production Deployment

### Using Systemd

**Worker Service** (`/etc/systemd/system/saferoute-worker.service`):
```ini
[Unit]
Description=SafeRoute Celery Worker
After=network.target redis.target

[Service]
Type=forking
User=saferoute
WorkingDirectory=/opt/saferoute
Environment="APP_ENV=production"
ExecStart=/opt/saferoute/scripts/celery_worker.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

**Beat Service** (`/etc/systemd/system/saferoute-beat.service`):
```ini
[Unit]
Description=SafeRoute Celery Beat
After=network.target redis.target

[Service]
Type=simple
User=saferoute
WorkingDirectory=/opt/saferoute
Environment="APP_ENV=production"
ExecStart=/opt/saferoute/scripts/celery_beat.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable saferoute-worker saferoute-beat
sudo systemctl start saferoute-worker saferoute-beat
```

### Using Docker Compose

See `docker-compose.yml` for full configuration.

## Testing Celery Tasks

### Test Individual Tasks

```python
# Test H3 grid validation
from app.tasks.ingestion_tasks import validate_h3_grid_health

result = validate_h3_grid_health.delay()
print(result.get(timeout=30))

# Test grid rebuild
from app.tasks.ingestion_tasks import rebuild_safety_grid

result = rebuild_safety_grid.delay(months=1)
print(result.get(timeout=60))
```

### Test with Docker

```bash
# Start services
docker-compose up -d

# Check worker is running
celery -A app.celery_app inspect registered

# Trigger task via admin API (requires authentication)
curl -X POST http://localhost:8000/api/v1/admin/tasks/validate-grid-health

# Check worker logs
docker-compose logs -f worker
```

## Support

For issues or questions:

1. **Check logs:**
```bash
celery -A app.celery_app inspect stats
docker-compose logs -f worker beat
```

2. **Review task code:** `app/tasks/ingestion_tasks.py`

3. **Monitor with Flower:** http://localhost:5555

4. **Test manually:**
```bash
# Via Python
poetry run python -c "from app.tasks.ingestion_tasks import validate_h3_grid_health; print(validate_h3_grid_health.delay().get())"

# Via API
curl -X POST http://localhost:8000/api/v1/admin/tasks/validate-grid-health
```

## References

- [Celery Documentation](https://docs.celeryproject.org/)
- [H3 Documentation](https://h3geo.org/)
- [UK Police API](https://data.police.uk/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [Flower Documentation](https://flower.readthedocs.io/)
