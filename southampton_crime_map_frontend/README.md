# SafeRoute Frontend

Interactive web interface for finding safer walking and cycling routes in Southampton using crime data.

## Features

- **Interactive Map**: Click to set origin and destination points
- **Route Visualization**: View 3 alternative routes with safety scores
- **Crime Heatmap**: H3 hexagonal grid showing crime density
- **Turn-by-Turn Directions**: Step-by-step navigation instructions
- **Export to Google Maps**: Open selected route in Google Maps
- **Dark Mode**: Toggle between light and dark themes
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Next.js 16.0.3** - React framework with App Router and Turbopack
- **React 19** - UI library
- **TypeScript** - Type safety
- **MapLibre GL 5.12.0** - Interactive map rendering
- **Tailwind CSS 4** - Styling
- **shadcn/ui** - Component library (Radix UI primitives)
- **React Hook Form + Zod** - Form handling and validation
- **Framer Motion** - Animations
- **next-themes** - Theme management

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Backend API running on `http://localhost:8000`

### Installation

1. **Install dependencies**
```bash
npm install
```

2. **Set up environment variables**

Create a `.env.local` file:

```bash
# Backend API URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Optional: Analytics
NEXT_PUBLIC_VERCEL_ANALYTICS=false
```

3. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
southampton_crime_map_frontend/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   ├── map/                # Map-related components
│   └── route/              # Route display components
├── contexts/               # React contexts
│   └── MapContext.tsx      # Map state management
├── lib/                    # Utility functions
│   ├── api.ts              # API client
│   └── utils.ts            # Helper functions
└── public/                 # Static assets
```

## Available Scripts

- `npm run dev` - Start development server (http://localhost:3000)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Key Components

### Map Component
Interactive map using MapLibre GL with:
- Click handlers for setting origin/destination
- Route polyline rendering
- H3 hexagon heatmap layer
- Custom markers

### Route Panel
Displays route alternatives with:
- Safety scores (0-100)
- Distance and duration
- Turn-by-turn instructions
- Export to Google Maps button

### Heatmap Layer
H3 hexagonal grid showing crime density:
- Color-coded by safety score
- Green = safe, red = high crime
- Clickable cells for details

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | Yes |
| `NEXT_PUBLIC_VERCEL_ANALYTICS` | Enable Vercel Analytics | No |

## Building for Production

```bash
npm run build
npm run start
```

The build output will be in the `.next` directory.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)
