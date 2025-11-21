# SafeRoute

Find the safest walking and cycling routes across Southern England using real UK crime data.

## What It Does

SafeRoute analyzes crime data from the UK Police API to help you find safer routes across London, Southampton, and South West England. Instead of just showing you the shortest path, it gives you multiple route options ranked by safety based on actual crime incidents in the area.

## Key Features

- **Crime-Based Routing**: Routes are scored using real crime data from the UK Police API
- **Multiple Route Options**: See alternative routes with safety scores for each
- **Crime Heatmap**: View crime density on an interactive H3 hexagonal grid (~73m resolution)
- **Time-Weighted Scoring**: Recent crimes weighted more heavily, with time-of-day awareness
- **Cambridge Crime Harm Index**: Crime severity based on UK sentencing guidelines
- **Interactive Map**: Click to set origin and destination, see routes with turn-by-turn directions
- **Export to Google Maps**: Open your chosen route in Google Maps
- **Route History**: Save and track your routes (requires authentication)

## Tech Stack

### Backend

- **NestJS** - TypeScript framework with dependency injection
- **PostgreSQL + PostGIS** - Spatial database for crime data
- **TypeORM** - Database ORM
- **BullMQ + Redis** - Job queue for crime data ingestion
- **Turf.js** - Geospatial analysis
- **H3** - Hexagonal grid system for heatmaps

### Frontend

- **Next.js 16** - React framework with Turbopack
- **MapLibre GL** - Interactive maps
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

Currently supports:
- **London** (all boroughs)
- **Southampton** and South Coast
- **South West England** (including Exeter and surrounding areas)

Crime data analyzed over the past 12 months with automated monthly updates via BullMQ job queues.