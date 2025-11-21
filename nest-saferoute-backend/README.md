# SafeRoute API

A NestJS-based REST API that processes over 2.3 million UK crime records and generates H3 hexagonal safety grids for route analysis across Southern England.

## What It Does

- **Large-Scale Data Processing**: Ingests and processes 2.3+ million crime records from multiple UK police forces
- **H3 Spatial Indexing**: Generates hexagonal grids at resolution 10 (~73m cells) covering 4.29 square degrees
- **Adaptive Ingestion**: 144-cell geographic grid with recursive polygon splitting handles high-density areas
- **Weighted Crime Analysis**: Multi-factor scoring using recency, time-of-day, and Cambridge Crime Harm Index
- **Safe Route Calculation**: Provides multiple route alternatives ranked by safety and distance
- **Background Job Processing**: BullMQ handles 2,016 concurrent ingestion jobs with rate limiting

## Tech Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL 14+ with PostGIS for spatial queries (2.3M+ crime records)
- **Cache & Queue**: Redis + BullMQ (handles 2,016 concurrent jobs)
- **Spatial Indexing**: Uber H3 hexagonal grid system (resolution 10, ~73m cells)
- **Routing Engine**: OpenRouteService API
- **Memory Management**: 4GB heap allocation for large-scale H3 grid generation
- **Batch Processing**: 10,000-record batches for memory-efficient crime aggregation

## Quick Start

### Development with Docker

```bash
# Start all services (PostgreSQL, Redis, API)
make dev-up

# Stop all services
make dev-down

# View logs
make dev-logs
```

The API will be available at `http://localhost:8000`.
Swagger documentation at `http://localhost:8000/docs`.

### Local Development

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start PostgreSQL and Redis
docker-compose up -d db redis

# Run migrations
npm run migration:run

# Seed crime categories
npm run seed

# Start in development mode
npm run start:dev
```

## Environment Variables

Key variables in `.env`:

```bash
# Database
DATABASE_URL=postgresql://saferoute:changeme@localhost:5432/saferoute

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET=your_secret_key_here
JWT_ACCESS_TOKEN_EXPIRATION=15m
JWT_REFRESH_TOKEN_EXPIRATION=30d

# OpenRouteService
ORS_API_KEY=your_ors_api_key_here

# Admin API Key (for crime ingestion and grid generation)
ADMIN_API_KEY=your_admin_key_here

# Safety Configuration
DEFAULT_LOOKBACK_MONTHS=12
DEFAULT_SAFETY_WEIGHT=0.8
DEFAULT_ROUTE_BUFFER_M=50
H3_RESOLUTION=10
```

## API Endpoints

### Public Endpoints

- `GET /api/v1` - API information
- `GET /health` - Health check
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token

### Protected Endpoints (JWT Required)

- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/routes/safe` - Calculate safe routes
- `GET /api/v1/routes/history` - Get route history
- `DELETE /api/v1/routes/history/:id` - Delete route from history
- `GET /api/v1/users/me/settings` - Get user settings
- `PATCH /api/v1/users/me/settings` - Update user settings

### H3 Grid Endpoints

- `GET /api/v1/h3-grids/cells` - Get H3 cells for bounding box
- `GET /api/v1/h3-grids/safety-score` - Get safety score for coordinates
- `GET /api/v1/h3-grids/southampton` - Get all cells for configured coverage area

### Admin Endpoints (Admin API Key Required)

- `POST /api/v1/admin/ingest-crimes` - Ingest crime data for date range
- `GET /api/v1/admin/ingestion-progress` - Check ingestion progress
- `POST /api/v1/admin/ingestion/pause` - Pause crime ingestion
- `POST /api/v1/admin/ingestion/resume` - Resume crime ingestion
- `POST /api/v1/admin/ingestion/clear` - Clear ingestion queue
- `POST /api/v1/admin/generate-h3-grid` - Generate H3 grid for month

Admin endpoints accept API key via:

- Header: `X-Admin-API-Key: your_key`
- Or: `Authorization: Bearer your_key`

## Crime Data Ingestion

The system uses an adaptive grid approach to efficiently ingest large amounts of crime data:

**How it works:**
- Coverage area divided into 144 cells (12×12 grid for Southern England)
- Each cell processed as a separate BullMQ job
- Adaptive polygon splitting (up to 5 levels) handles areas exceeding API limits
- Rate limiting: 200 jobs per 30s (6.67 jobs/s), well under UK Police API's 15 req/s limit
- Duplicate detection prevents re-ingesting existing crimes

**Ingest crime data:**

```bash
# Using admin API
curl -X POST http://localhost:8000/api/v1/admin/ingest-crimes \
  -H "X-Admin-API-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"startMonth": "2024-01", "endMonth": "2024-12"}'

# Check progress
curl -H "X-Admin-API-Key: your_admin_key" \
  http://localhost:8000/api/v1/admin/ingestion-progress
```

**Result:** 2.3+ million crimes ingested across 14 months of historical data.

## H3 Grid Generation

The H3 grid generation processes millions of crimes to create a hexagonal safety heatmap:

**Technical Details:**
- Uses Uber's H3 spatial indexing at resolution 10 (~73m edge length per hexagon)
- Processes 2.3M+ crimes in 10,000-record batches to manage memory
- Runs with 4GB heap allocation (`--max-old-space-size=4096`)
- Each crime weighted by: recency, time-of-day, and harm severity (Cambridge Crime Harm Index)
- Risk scores normalized to 0-100 safety scale using piecewise linear functions
- Generates unique H3 cells only where crimes exist (memory-efficient)

**Generate grid for a month:**

```bash
curl -X POST http://localhost:8000/api/v1/admin/generate-h3-grid \
  -H "X-Admin-API-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "month": "2024-09",
    "lookbackMonths": 12,
    "resolution": 10
  }'
```

**Performance:** Processes millions of crimes and generates thousands of H3 cells in minutes.

## Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Test admin endpoints live
./scripts/test-live.sh
```

## Database Migrations

```bash
# Generate a new migration
npm run migration:generate -- src/database/migrations/MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

## Project Structure

```
src/
├── common/          # Shared utilities, guards, decorators
├── config/          # Configuration files and validation
├── database/        # Database module, migrations, seeds
├── modules/
│   ├── admin/       # Admin API endpoints
│   ├── auth/        # Authentication (JWT, login, register)
│   ├── crime/       # Crime data ingestion and storage
│   ├── route/       # Route calculation and history
│   ├── safety/      # Safety scoring and H3 grid
│   └── user/        # User management
└── main.ts          # Application entry point
```

## Safety Algorithm

See [docs/ALGORITHM.md](docs/ALGORITHM.md) for details on how safety scores are calculated.

TL;DR: We weight crimes by recency, time-of-day, and harm severity (based on Cambridge Crime Harm Index), then normalize to a 0-100 safety score.

## Production Deployment

```bash
# Build for production
npm run build

# Start with Docker Compose
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f app
```

Make sure to:

1. Set strong passwords in `.env.production`
2. Change `JWT_SECRET` to a long random string
3. Change `ADMIN_API_KEY` to a secure key
4. Update `CORS_ORIGINS` to your frontend domain
5. Configure proper SSL/TLS termination (nginx, CloudFlare, etc.)


