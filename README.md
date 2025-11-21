# SafeRoute

## What It Does

SafeRoute processes over 2.3 million crime records to help you find safer routes across London, Southampton, and South West England. The system ingests crime data from multiple UK police forces and generates an H3 hexagonal grid that covers the entire region at ~73m resolution. Instead of just showing you the shortest path, it analyzes actual crime patterns to give you multiple route options ranked by safety.

## Key Features

- **Large-Scale Crime Grid**: 2.3+ million crimes mapped onto an H3 hexagonal grid system at resolution 10 (~73m per cell)
- **Multi-Region Coverage**: London, Southampton, and South West England (95x larger than the original Southampton-only deployment)
- **Optimized Performance**: Handles thousands of hexagons smoothly through debouncing, cell limits, zoom-based rendering, and incremental batching
- **Automated Data Pipeline**: BullMQ job queue processes 2,016 jobs (144 geographic cells × 14 months of data)
- **Crime-Based Routing**: Routes are scored using weighted crime analysis with recency, time-of-day, and harm severity
- **Cambridge Crime Harm Index**: Crime severity weighted by UK sentencing guidelines
- **Interactive Heatmap**: Real-time visualization of crime density across the entire coverage area
- **Multiple Route Options**: See alternative routes with safety scores, distance, and turn-by-turn directions
- **Export to Google Maps**: Open your chosen route in Google Maps
- **Route History**: Save and track your routes (requires authentication)

## Tech Stack

### Backend

- **NestJS** - TypeScript framework with dependency injection
- **PostgreSQL + PostGIS** - Spatial database storing 2.3M+ crime records with geographic indexing
- **TypeORM** - Database ORM with raw SQL for performance-critical operations
- **BullMQ + Redis** - Job queue handling 2,000+ concurrent crime ingestion tasks
- **Uber H3** - Hexagonal hierarchical spatial index at resolution 10 (73m cells)
- **Turf.js** - Geospatial calculations for route analysis

### Frontend

- **Next.js 16** - React framework with Turbopack
- **Leaflet + React Leaflet** - Interactive maps with GeoJSON layers
- **Performance Optimizations** - Debounced loading, cell limits, zoom-based rendering, and incremental batching
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components

### External APIs

- **UK Police API** - Crime data source
- **OpenRouteService** - Route calculations

## Project Structure

```
saferoute/
├── nest-saferoute-backend/    # NestJS backend
│   ├── src/
│   │   ├── modules/
│   │   │   ├── route/         # Route finding and scoring
│   │   │   ├── safety/        # Safety scoring algorithms
│   │   │   ├── crime/         # Crime data management
│   │   │   └── ingestion/     # Data ingestion jobs
│   │   └── common/            # Shared utilities
│   └── scripts/               # Database and ingestion scripts
│
├── southampton_crime_map_frontend/  # Next.js frontend
│   ├── app/                   # App router pages
│   ├── components/            # React components
│   └── lib/                   # Utilities and API clients
│
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ with PostGIS extension
- Redis (for job queue)
- OpenRouteService API key
- UK Police API access (no key required)

there is a docker compose file too , you can use docker compose it or use make to do it too (just type make help in the backend directory)

### Backend Setup

1. **Install dependencies**

```bash
cd nest-saferoute-backend
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
# Edit .env with your database credentials and API keys
```

3. **Set up database**

```bash
# Create database and enable PostGIS
npm run db:setup

# Run migrations
npm run migration:run

# Seed crime categories
npm run seed
```

4. **Ingest crime data**

```bash
# Ingest recent crime data for the configured coverage area
npm run ingest

# Generate H3 grid for heatmap
npm run populate:h3
```

5. **Start the server**

```bash
npm run start:dev
```

Backend runs at `http://localhost:8000`

### Frontend Setup

1. **Install dependencies**

```bash
cd southampton_crime_map_frontend
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
# Add your MapLibre token and backend API URL
```

3. **Start the dev server**

```bash
npm run dev
```

Frontend runs at `http://localhost:3000`

## How It Works

See [ALGORITHM.md](nest-saferoute-backend/docs/ALGORITHM.md) for details on the safety scoring algorithm.

## API Documentation

Once the backend is running, Swagger docs are available at:
`http://localhost:8000/docs`

## Scripts

### Backend Scripts

- `npm run ingest` - Ingest crime data from UK Police API
- `npm run populate:h3` - Generate H3 grid cells for heatmap
- `npm run db:setup` - Set up database with PostGIS
- `npm run migration:run` - Run database migrations
- `npm run seed` - Seed crime categories
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests

### Frontend Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server

## Data Coverage

The system covers 4.29 square degrees across Southern England (95x larger than the initial Southampton deployment):

- **London** - Full Metropolitan Police coverage (all boroughs)
- **Southampton & South Coast** - Hampshire Constabulary
- **South West England** - Devon & Cornwall Police (including Exeter)

**Data Scale:**
- 2.3+ million crime records ingested and processed
- 144 geographic grid cells for parallelized API requests
- 14 months of historical data with monthly updates
- H3 grid generation processes crimes in 10,000-record batches with 4GB heap allocation
- Adaptive polygon splitting (up to 5 levels deep) handles high-density areas like central London
