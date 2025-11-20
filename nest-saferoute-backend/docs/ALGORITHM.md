# The SafeRoute Safety Algorithm

This doc explains how we calculate safety scores for routes. The goal is simple: weight recent, nearby, and serious crimes more heavily than old, distant, or minor ones.

## The Core Formula

For each crime near a route segment, we calculate a weighted score:

```
crime_weight = recency_weight × time_weight × harm_weight
```

Then we sum up all the weighted crimes in that segment and convert it to a risk score. Finally, we flip risk to safety (since higher safety should be better).

## Weights Breakdown

### 1. Recency Weight

Recent crimes matter more than old ones. Here's the decay:

- **0-3 months ago**: 1.0 (full weight)
- **4-6 months ago**: 0.75
- **7-12 months ago**: 0.5
- **12+ months ago**: 0.25

If you set "lookback months" to 6, we only consider crimes from the last 6 months. Default is 12 months.

### 2. Time-of-Day Weight

Crimes have different patterns depending on when they happen. If you're planning to walk at night, nighttime crimes are weighted higher.

Time buckets:
- **Night**: 22:00 - 06:00
- **Morning**: 06:00 - 09:00
- **Day**: 09:00 - 17:00
- **Evening**: 17:00 - 22:00

Each crime category has different time weights. For example:
- **Violent crime**: 1.8× at night, 0.6× in morning
- **Shoplifting**: 1.8× during day, 0.2× at night
- **Vehicle crime**: 1.7× at night, 0.6× in morning

If the crime's time bucket matches your planned travel time, it gets weighted higher. If it doesn't match, it's weighted lower.

### 3. Harm Weight

Based on the Cambridge Crime Harm Index (CCHI), which uses days of imprisonment as harm weights. Values are scaled from actual UK sentencing guidelines:

| Category | Harm Weight | Basis |
|----------|-------------|-------|
| Violence and sexual offences | 75.0 | ~750 days avg (serious assault, sexual offenses) |
| Robbery | 73.0 | ~730 days (2 years typical sentence) |
| Possession of weapons | 36.5 | ~365 days (1 year) |
| Burglary | 18.75 | ~187.5 days (150 hours unpaid work equivalent) |
| Drugs | 18.0 | ~180 days (6 months, varies widely) |
| Vehicle crime | 9.0 | ~90 days (3 months typical) |
| Theft from the person | 9.0 | ~90 days |
| Criminal damage and arson | 9.0 | ~90 days (varies by severity) |
| Other theft | 5.0 | ~50 days average |
| Public order | 3.0 | ~30 days |
| Bicycle theft | 2.0 | ~20 days (Band C fine equivalent) |
| Shoplifting | 1.0 | ~10 days (Band B fine equivalent) |
| Other crime | 5.0 | ~50 days average |
| Anti-social behaviour | 0.5 | ~5 days (civil penalty equivalent) |

These weights reflect the actual severity of crimes as measured by UK sentencing guidelines.

## From Crimes to Scores

### Step 1: Calculate Weighted Crime Count

For a route segment, we:
1. Find all crimes within 50 meters of the segment
2. Apply the three weights (recency × time × harm) to each crime
3. Sum them up to get a total weighted count

### Step 2: Normalize to Risk Score

We use a piecewise linear function calibrated to Southampton's actual crime distribution. The thresholds match data percentiles for balanced visualization:

```
if weighted_count < 5:
    risk_score = 0.15 × (weighted_count / 5.0)          # P15: 0.0-0.15
elif weighted_count < 20:
    risk_score = 0.15 + 0.20 × ((weighted_count - 5) / 15)   # P50: 0.15-0.35
elif weighted_count < 50:
    risk_score = 0.35 + 0.20 × ((weighted_count - 20) / 30)  # P75: 0.35-0.55
elif weighted_count < 100:
    risk_score = 0.55 + 0.20 × ((weighted_count - 50) / 50)  # P90: 0.55-0.75
elif weighted_count < 200:
    risk_score = 0.75 + 0.15 × ((weighted_count - 100) / 100)  # P95: 0.75-0.90
else:
    risk_score = 0.90 + 0.10 × (min(weighted_count - 200, 300) / 300)  # 0.90-1.0
```

This piecewise function ensures that risk scores map realistically to Southampton's crime distribution. Most areas fall in the 0.15-0.55 range, with only the most dangerous areas reaching 0.75+.

### Step 3: Convert to Safety Score

Safety is the inverse of risk:

```
safety_score = (1.0 - risk_score) × 100
```

So 0% risk = 100% safety, and vice versa. The final score is from 0-100 where higher is safer.

### Step 4: Aggregate Segments

Each route is broken into 100-meter segments. To get the overall route score:

1. Calculate safety score for each segment
2. Weight each score by the segment's length
3. Take the weighted average

Longer segments have more influence on the final score. This prevents a single bad 50m stretch from tanking an otherwise safe 2km route.

## Route Ranking

Once we have safety scores for all three routes, we rank them using a composite score:

```
composite_score = (safety_score × safety_weight) + (distance_score × (1 - safety_weight))
```

Where:
- `safety_score` is 0-100 (as calculated above)
- `distance_score` is normalized based on route distance (shorter is better)
- `safety_weight` defaults to 0.8 (you can adjust this)

Routes are sorted by composite score (highest first), so the top route is the best balance of safety and distance given your preferences.

## Example Calculation

Let's say a 100m segment has:
- 1 violent crime from 2 months ago → 1.0 × 1.0 × 75.0 = 75.0
- 3 shoplifting incidents from 8 months ago → 3 × 0.5 × 1.0 = 1.5
- 1 burglary from 4 months ago → 1.0 × 0.75 × 18.75 = 14.06

Total weighted count = 75.0 + 1.5 + 14.06 = 90.56

Since weighted_count (90.56) is between 50 and 100:
Risk score = 0.55 + 0.20 × ((90.56 - 50) / 50) = 0.55 + 0.20 × 0.811 = 0.712

Safety score = (1.0 - 0.712) × 100 = 28.8

That's a low safety score because of the recent violent crime.

## H3 Hexagonal Grid System

For heatmaps and area-based safety visualization, we use Uber's H3 hexagonal grid system. Instead of scoring routes on-demand, we pre-calculate safety scores for hexagonal cells covering Southampton.

### What is H3?

H3 divides the world into hexagonal cells at different resolutions. We use **resolution 10**, where each hexagon has an edge length of roughly 73 meters (area of ~13,781 m²). Hexagons are better than squares because:
- Every neighbor is the same distance away
- No awkward corner cases
- Better visual representation of "nearness"

### Grid Generation

We generate H3 cells for Southampton's bounding box:
- **Latitude**: 50.85° to 51.00° (extended to include Airport, Hedge End, and surrounding areas)
- **Longitude**: -1.55° to -1.25°

The population algorithm is crime-driven:
1. Query all crimes within the Southampton bounding box for the lookback period
2. Convert each crime's lat/lng to its H3 cell ID at resolution 10
3. Group crimes by cell ID
4. Calculate safety scores only for cells that contain crimes
5. Store cells in database with monthly granularity

This approach is efficient because we only store and calculate scores for areas where crimes actually occurred.

### Cell Scoring Algorithm

For each H3 cell, we calculate a safety score using the same piecewise function as route segments:

1. **Get cell boundary**: Convert H3 cell to a polygon (6-sided hexagon)
2. **Query crimes**: Find all crimes within that hexagon for the lookback period (typically 12 months)
3. **Apply weights**: For each crime, calculate `recency_weight × time_weight × harm_weight`
4. **Sum weighted counts**: Add up all weighted crime values
5. **Calculate risk**: Use the piecewise linear function (same thresholds as route scoring)
6. **Convert to safety**: `safety_score = (1.0 - risk_score) × 100`

We also store:
- **Crime count** (raw number of crimes)
- **Weighted crime count** (sum of all weights)
- **Category breakdown** (how many of each crime type)
- **Cell center coordinates** (lat/lng)

### Time-Based Grid Population

Cells are populated monthly. We store separate safety scores for each month, so you can:
- See how safety changes over time
- Compare current month to historical data
- Filter by specific time periods

The populate script runs for recent months (typically last 6 months) and creates/updates cells in the database.

### Querying the Grid

To show a heatmap:
1. Get the map's bounding box (what the user is viewing)
2. Query all H3 cells that intersect with that box
3. Return each cell's safety score and geometry
4. Frontend colors the hexagons based on safety (green = safe, red = dangerous)

For a specific point (like when you hover on the map):
1. Convert lat/lng to H3 cell ID
2. Look up that cell in the database
3. Return the pre-calculated safety score instantly

This is much faster than calculating safety on-the-fly for every map interaction.

### H3 vs Route Scoring

The key difference:
- **Route scoring**: Dynamic, calculated when you request a route, uses 100m line segments with 50m buffer
- **H3 grid scoring**: Pre-calculated, stored in database, uses ~73m edge hexagons

Both use the same weighting formula and piecewise risk function, but H3 cells give you a general area safety score while route scoring is specific to the exact path you'll take.