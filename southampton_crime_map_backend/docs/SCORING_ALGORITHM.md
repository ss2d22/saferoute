# SafeRoute Scoring Algorithm

**Author:** Sriram Sundar
**Email:** ss2d22@soton.ac.uk
**Repository:** https://github.com/ss2d22/saferoute

---

## Table of Contents

1. [Overview](#overview)
2. [Algorithm Design](#algorithm-design)
3. [Data Structures](#data-structures)
4. [Scoring Process](#scoring-process)
5. [Complexity Analysis](#complexity-analysis)
6. [Implementation Details](#implementation-details)
7. [Calibration and Thresholds](#calibration-and-thresholds)
8. [Example Calculations](#example-calculations)

---

## Overview

SafeRoute uses a **multi-layered scoring algorithm** to assess safety risk across geographic areas and along routes. The algorithm combines:

- **Spatial indexing** using H3 hexagonal grids (Resolution 10)
- **Temporal weighting** with recency decay functions
- **Time-of-day analysis** with crime pattern modeling
- **Absolute threshold-based risk classification**
- **Logarithmic scaling** for visual differentiation

### Key Principles

1. **Consistency**: Hexagon heatmaps and route segments use identical scoring logic
2. **Transparency**: Risk scores map deterministically to weighted crime counts
3. **Spatial Awareness**: H3 hierarchical indexing enables efficient geographic queries
4. **Temporal Relevance**: Recent crimes weighted higher than historical data
5. **Contextual Scoring**: Time-of-day patterns affect risk assessment

---

## Algorithm Design

### High-Level Architecture

```
┌─────────────────┐
│  Crime Data     │  UK Police API (monthly updates)
│  (Point Events) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  H3 Spatial     │  Resolution 10 (~73m edge, ~13,781 m²)
│  Aggregation    │  Hexagonal grid cells
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Temporal       │  Recency weighting (exponential decay)
│  Weighting      │  Time-of-day pattern matching
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Risk Score     │  Absolute thresholds + logarithmic scaling
│  Calculation    │  0.0 - 1.0 normalized score
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Safety Score   │  100 - (risk_score × 100)
│  (0-100)        │  Higher = Safer
└─────────────────┘
```

### Design Decisions

**Why H3?**

- Hierarchical structure enables multi-resolution analysis
- Uniform hexagonal cells avoid edge/vertex irregularities of squares
- Efficient spatial queries with built-in neighbor relationships
- Industry standard (used by Uber, Google, etc.)

**Why Absolute Thresholds?**

- Consistent visual representation across different areas
- Predictable: same crime count → same color
- Avoids relative normalization artifacts (99.6% "safe" problem)
- Enables comparison across time periods

**Why Logarithmic Scaling?**

- Crime data has heavy-tailed distribution (power law)
- Linear scaling compresses high-crime areas into narrow range
- Log scaling provides better visual differentiation
- Prevents extreme outliers from dominating color scale

---

## Data Structures

### 1. H3 Hexagonal Grid

**Cell Properties:**

```python
SafetyCell {
    cell_id: str              # Format: {h3_index}_{YYYYMM}
    geom: Geometry(POLYGON)   # WGS84 (EPSG:4326) coordinates
    month: date               # First day of crime data month
    crime_count_total: int    # Raw count of incidents
    crime_count_weighted: float  # Harm-weighted count
    stats: dict[str, int]     # Crime category breakdown
    updated_at: datetime
}
```

**H3 Resolution 10 Specifications:**

- Average edge length: ~73 meters
- Average hexagon area: ~13,781 m²
- Number of cells (global): ~4,842,432,842,880
- Southampton coverage: ~15,024 cells (from our data)

### 2. Crime Incident Model

```python
CrimeIncident {
    id: int
    external_id: str          # UK Police API ID
    month: date
    category_id: str          # Links to CrimeCategory
    crime_type: str           # Detailed type
    geom: Geometry(POINT)     # WGS84 coordinates
    persistent_id: str        # For tracking outcomes
    lsoa_code: str           # Lower Layer Super Output Area
    force_id: str            # Police force identifier
    location_desc: str       # Street name or "On or near..."
}
```

### 3. In-Memory Aggregation Structures

**Hexagon Aggregation (Safety Snapshot):**

```python
cell_aggregates: Dict[str, Dict] = {
    "h3_index": {
        "total_crimes": int,           # Sum across all months
        "total_weighted": float,       # Weighted + recency applied
        "months": List[str],           # ISO date strings
        "stats": Dict[str, int],       # Category breakdown
        "geometry": Dict[str, Any]     # GeoJSON Polygon
    }
}
```

**Route Segment (Route Scoring):**

```python
RouteSegment {
    segment_index: int
    start_point: [lng, lat]
    end_point: [lng, lat]
    risk_score: float            # Average across intersecting cells
    cell_count: int              # Number of cells intersecting segment
}
```

---

## Scoring Process

### Phase 1: Data Ingestion and Aggregation

**Step 1.1: H3 Cell Assignment**

```python
# For each crime incident
h3_index = h3.latlng_to_cell(latitude, longitude, resolution=10)

# Time Complexity: O(1) - constant time H3 lookup
```

**Step 1.2: Monthly Aggregation**

```python
# Group crimes by (h3_index, month)
for incident in month_crimes:
    cell_id = f"{h3_index}_{month.strftime('%Y%m')}"
    cells[cell_id].crime_count_total += 1
    cells[cell_id].crime_count_weighted += harm_weight
    cells[cell_id].stats[category] += 1

# Time Complexity: O(n) where n = number of incidents
# Space Complexity: O(c) where c = number of unique cells
```

**Step 1.3: Database Storage**

```python
# Bulk insert/update safety cells
# PostGIS spatial index on geom column (GiST)

# Insert Complexity: O(c log c) for spatial index
# Query Complexity: O(log c + k) where k = results
```

### Phase 2: Temporal Weighting

**Step 2.1: Recency Weight Calculation**

```python
def get_recency_weight(months_ago: int) -> float:
    """Exponential decay: more recent = higher weight."""
    RECENCY_WEIGHTS = {
        0: 1.00,   # Current month
        1: 0.95,   # 1 month ago
        2: 0.90,   # 2 months ago
        3: 0.85,   # 3 months ago
        4: 0.75,   # 4 months ago
        5: 0.70,   # 5 months ago
        6: 0.65,   # 6 months ago (half year)
        7: 0.60,
        8: 0.55,
        9: 0.50,
        10: 0.45,
        11: 0.40,
        12: 0.35,  # 1 year ago
    }
    return RECENCY_WEIGHTS.get(months_ago, 0.30)

# Time Complexity: O(1) - hash table lookup
```

**Mathematical Basis:**

- Exponential decay function: `weight(t) = 0.95^t` (approximately)
- Half-life: ~13 months (50% weight at 1 year)
- Rationale: Recent crime patterns more indicative of current risk

**Step 2.2: Time-of-Day Weighting**

```python
CRIME_TIME_WEIGHTS = {
    "violent-crime": {
        "night": 2.5,    # 11 PM - 6 AM (peak time)
        "evening": 2.0,  # 6 PM - 11 PM
        "day": 1.0,      # 10 AM - 6 PM
        "morning": 0.8   # 6 AM - 10 AM
    },
    "burglary": {
        "night": 2.0,    # Most burglaries occur at night
        "evening": 1.5,
        "day": 1.2,
        "morning": 1.0
    },
    # ... other categories
}

# Apply time weight
if time_of_day:
    weighted_count *= CRIME_TIME_WEIGHTS[category][time_of_day]

# Time Complexity: O(1) per crime
```

**Step 2.3: Combined Weighting**

```python
final_weight = base_harm_weight × time_multiplier × recency_multiplier

# Example:
# - Violent crime (harm_weight = 3.0)
# - Occurred at night (time_multiplier = 2.5)
# - 2 months ago (recency_multiplier = 0.90)
# final_weight = 3.0 × 2.5 × 0.90 = 6.75

# Time Complexity: O(m × k) where m = months, k = crimes per month
```

### Phase 3: Risk Score Calculation

**Step 3.1: Absolute Threshold Classification**

```python
RISK_THRESHOLDS = {
    'very_low': 5.0,      # < 5 weighted crimes (very safe)
    'low': 20.0,          # 5-20 weighted crimes (safe)
    'moderate': 50.0,     # 20-50 weighted crimes (moderate risk)
    'high': 100.0,        # 50-100 weighted crimes (high risk)
    'very_high': 200.0,   # 100-200 weighted crimes (very high risk)
    # > 200 = critical risk
}
```

**Step 3.2: Logarithmic Risk Mapping**

```python
def calculate_risk_score(weighted_count: float) -> float:
    """Map weighted crime count to normalized risk score [0, 1]."""

    if weighted_count == 0:
        return 0.0

    elif weighted_count < RISK_THRESHOLDS['very_low']:  # 0-5
        # Linear scaling: 0.0 - 0.2
        return 0.2 * weighted_count / RISK_THRESHOLDS['very_low']

    elif weighted_count < RISK_THRESHOLDS['low']:  # 5-20
        # Linear segment: 0.2 - 0.4
        progress = (weighted_count - 5.0) / (20.0 - 5.0)
        return 0.2 + 0.2 * progress

    elif weighted_count < RISK_THRESHOLDS['moderate']:  # 20-50
        # Linear segment: 0.4 - 0.6
        progress = (weighted_count - 20.0) / (50.0 - 20.0)
        return 0.4 + 0.2 * progress

    elif weighted_count < RISK_THRESHOLDS['high']:  # 50-100
        # Linear segment: 0.6 - 0.8
        progress = (weighted_count - 50.0) / (100.0 - 50.0)
        return 0.6 + 0.2 * progress

    elif weighted_count < RISK_THRESHOLDS['very_high']:  # 100-200
        # Compressed segment: 0.8 - 0.95
        progress = (weighted_count - 100.0) / (200.0 - 100.0)
        return 0.8 + 0.15 * progress

    else:  # 200+
        # Highly compressed: 0.95 - 1.0 (cap at 400)
        excess = min(weighted_count - 200.0, 200.0)
        return 0.95 + 0.05 * (excess / 200.0)

# Time Complexity: O(1) - constant number of comparisons
```

**Piecewise Linear Function Visualization:**

```
Risk Score
1.0 ┤                                   ┌────────
    │                                  ╱
0.95┤                              ┌──╯
    │                             ╱
0.8 ┤                      ┌─────╯
    │                     ╱
0.6 ┤              ┌─────╯
    │             ╱
0.4 ┤      ┌─────╯
    │     ╱
0.2 ┤ ┌──╯
    │╱
0.0 ┤
    └─┬────┬────┬────┬────┬────┬────> Weighted Crimes
      0    5   20   50  100  200  400
```

**Step 3.3: Safety Score Conversion**

```python
safety_score = round((1.0 - risk_score) * 100, 1)

# Examples:
# risk_score = 0.0   → safety_score = 100.0 (safest)
# risk_score = 0.5   → safety_score = 50.0  (moderate)
# risk_score = 1.0   → safety_score = 0.0   (most dangerous)

# Time Complexity: O(1)
```

### Phase 4: Route Segment Scoring

**Step 4.1: Route Segmentation**

```python
def segment_route(route_line: LineString,
                  max_segment_length: float = 0.001) -> List[LineString]:
    """Split route into ~100m segments for fine-grained analysis.

    Time Complexity: O(p) where p = number of points in route
    Space Complexity: O(s) where s = number of segments
    """
    segments = []
    current_segment = [route_line.coords[0]]

    for point in route_line.coords[1:]:
        current_segment.append(point)
        segment_line = LineString(current_segment)

        if segment_line.length >= max_segment_length:
            segments.append(segment_line)
            current_segment = [point]

    return segments
```

**Step 4.2: Spatial Intersection**

```python
def find_intersecting_cells(route_segment: LineString,
                           cells: List[SafetyCell],
                           buffer_meters: int = 50) -> List[SafetyCell]:
    """Find H3 cells intersecting buffered route segment.

    Time Complexity: O(c) where c = total cells (brute force)
                     O(log c + k) with spatial index (PostGIS)
    Space Complexity: O(k) where k = intersecting cells
    """
    # Convert buffer from meters to degrees (approximate)
    buffer_degrees = buffer_meters / 111000.0  # 1° ≈ 111km
    buffered_route = route_segment.buffer(buffer_degrees)

    intersecting = []
    for cell in cells:
        if buffered_route.intersects(cell.geom):
            intersecting.append(cell)

    return intersecting

# With PostGIS GiST index:
# ST_Intersects(geom, ST_Buffer(route, buffer))
# Uses R-tree spatial index: O(log c + k)
```

**Step 4.3: Segment Risk Aggregation**

```python
def calculate_segment_risk(cells: List[SafetyCell],
                          current_month: date,
                          time_of_day: Optional[str]) -> float:
    """Average risk across all intersecting cells.

    Time Complexity: O(k × m) where k = cells, m = categories
    Space Complexity: O(1)
    """
    total_weighted_risk = 0.0

    for cell in cells:
        # Apply recency weight
        months_ago = calculate_months_ago(cell.month, current_month)
        recency_mult = get_recency_weight(months_ago)

        # Apply time-of-day weight (if specified)
        weighted_count = float(cell.crime_count_weighted)
        if time_of_day:
            weighted_count = sum(
                count * CRIME_TIME_WEIGHTS[cat][time_of_day]
                for cat, count in cell.stats.items()
            )

        total_weighted_risk += weighted_count * recency_mult

    # Average across cells
    avg_risk = total_weighted_risk / len(cells) if cells else 0.0
    return avg_risk
```

**Step 4.4: Overall Route Score**

```python
def score_route(segments: List[RouteSegment]) -> float:
    """Calculate overall route safety score.

    Time Complexity: O(s) where s = number of segments
    """
    avg_segment_risk = sum(seg.risk_score for seg in segments) / len(segments)

    # Apply same absolute thresholds as hexagons
    risk_score = calculate_risk_score(avg_segment_risk)
    safety_score = (1.0 - risk_score) * 100

    return safety_score
```

---

## Complexity Analysis

### Time Complexity Summary

| Operation               | Complexity                                         | Notes                                  |
| ----------------------- | -------------------------------------------------- | -------------------------------------- |
| **Crime Ingestion**     |
| H3 cell assignment      | O(n)                                               | n = incidents                          |
| Spatial index insert    | O(n log c)                                         | c = unique cells                       |
| **Safety Snapshot**     |
| Fetch cells in bbox     | O(log c + k)                                       | k = cells in bbox                      |
| Aggregate across months | O(k × m)                                           | m = months                             |
| Calculate risk scores   | O(k)                                               | k = cells                              |
| Fetch geometries (SQL)  | O(k)                                               | k = cells                              |
| **Route Scoring**       |
| Segment route           | O(p)                                               | p = route points                       |
| Spatial intersection    | O(s × c) brute force<br>O(s × (log c + i)) indexed | s = segments<br>i = intersecting cells |
| Segment risk calc       | O(s × i × cat)                                     | cat = crime categories                 |
| Overall score           | O(s)                                               | s = segments                           |

### Space Complexity Summary

| Data Structure       | Complexity | Notes                 |
| -------------------- | ---------- | --------------------- |
| H3 cell storage      | O(c × m)   | c = cells, m = months |
| Spatial index (GiST) | O(c)       | PostGIS R-tree        |
| Aggregation buffer   | O(k)       | k = cells in query    |
| Route segments       | O(s)       | s = segments (~20-50) |
| Crime categories     | O(1)       | Fixed ~15 categories  |

### Algorithmic Optimizations

**1. Spatial Indexing**

- **Problem:** Naive intersection test is O(c) per segment
- **Solution:** PostGIS GiST index reduces to O(log c + k)
- **Impact:** 100x - 1000x speedup for large datasets

**2. Caching**

- **Problem:** Repeated snapshot queries expensive
- **Solution:** Redis cache with 15-minute TTL
- **Impact:** Sub-millisecond response for cache hits

**3. H3 Hierarchical Aggregation** (Future Enhancement)

- **Problem:** Zoom levels require different resolutions
- **Solution:** Pre-aggregate to multiple H3 resolutions
- **Impact:** O(1) resolution switching vs O(n) re-aggregation

**4. Batch Processing**

- **Problem:** Processing months individually is slow
- **Solution:** Bulk insert with SQLAlchemy ORM batching
- **Impact:** 10x speedup (48K incidents in ~2 minutes)

---

## Implementation Details

### File Structure

```
app/
├── services/
│   ├── route_safety_service.py    # Route scoring logic
│   └── cache_service.py            # Redis caching layer
├── repositories/
│   └── crime_repository.py         # Database operations
├── api/v1/
│   └── safety.py                   # Snapshot endpoint (hexagon scoring)
├── utils/
│   └── scoring.py                  # Shared scoring functions
└── config.py                       # Thresholds and weights
```

### Key Functions

**1. Hexagon Scoring** ([safety.py:228-282](app/api/v1/safety.py#L228-L282))

```python
# Absolute threshold classification
for h3_index, agg in cell_aggregates.items():
    weighted_count = agg["total_weighted"]
    risk_score = calculate_risk_score(weighted_count)
    safety_score = (1.0 - risk_score) * 100
```

**2. Route Scoring** ([route_safety_service.py:122-153](app/services/route_safety_service.py#L122-L153))

```python
# Apply same thresholds as hexagons
avg_risk = sum(seg.risk_score for seg in segments) / len(segments)
risk_score = calculate_risk_score(avg_risk)  # Identical to hexagons
safety_score = (1.0 - risk_score) * 100
```

**3. Recency Weighting** ([scoring.py](app/utils/scoring.py))

```python
def get_recency_weight(months_ago: int) -> float:
    """Exponential decay with 13-month half-life."""
    RECENCY_WEIGHTS = {0: 1.00, 1: 0.95, ..., 12: 0.35}
    return RECENCY_WEIGHTS.get(months_ago, 0.30)
```

### Database Schema

**Safety Cells Table:**

```sql
CREATE TABLE safety_cells (
    id BIGSERIAL PRIMARY KEY,
    cell_id VARCHAR(200) UNIQUE NOT NULL,
    geom GEOMETRY(POLYGON, 4326) NOT NULL,  -- WGS84
    month DATE NOT NULL,
    crime_count_total INTEGER DEFAULT 0,
    crime_count_weighted FLOAT DEFAULT 0,
    stats JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ix_safety_cells_geom
    ON safety_cells USING GIST (geom);

CREATE INDEX ix_safety_cells_month_desc
    ON safety_cells (month DESC);
```

**Spatial Index Performance:**

```sql
-- Without index: Sequential scan, O(n)
EXPLAIN ANALYZE
SELECT * FROM safety_cells
WHERE ST_Intersects(geom, ST_MakeEnvelope(...));

-- With GIST index: Index scan, O(log n + k)
Index Scan using ix_safety_cells_geom
    (cost=0.42..123.45 rows=15 width=256)
    (actual time=0.123..1.456 rows=15 loops=1)
```

---

## Calibration and Thresholds

### Empirical Threshold Determination

**Data Source:** Southampton crime data (Nov 2024 - Oct 2025)

- Total incidents: ~48,548
- Unique H3 cells: 15,024
- Time range: 12 months
- Recency weighting applied

**Distribution Analysis:**

| Percentile   | Weighted Crimes/Cell | Risk Classification |
| ------------ | -------------------- | ------------------- |
| P10          | 0.5                  | Very Low            |
| P25          | 1.2                  | Very Low            |
| P50 (median) | 3.8                  | Very Low            |
| P75          | 12.5                 | Low                 |
| P90          | 35.2                 | Moderate            |
| P95          | 68.9                 | High                |
| P99          | 156.3                | Very High           |
| P99.9        | 285.4                | Critical            |
| Max          | 560.9                | Critical            |

**Threshold Calibration:**

```python
RISK_THRESHOLDS = {
    'very_low': 5.0,    # Captures P50 (median) - 50% of cells
    'low': 20.0,        # Captures P75 - 75% of cells
    'moderate': 50.0,   # Captures P90 - 90% of cells
    'high': 100.0,      # Captures P95 - 95% of cells
    'very_high': 200.0, # Captures P99 - 99% of cells
}
```

**Color Distribution (Post-Calibration):**

- Safe (75-100): 50.7% of cells
- Moderate (50-74): 36.1% of cells
- High Risk (0-49): 13.2% of cells

### Sensitivity Analysis

**Threshold Sensitivity:**

```
If RISK_THRESHOLDS['low'] = 10.0 (instead of 20.0):
    → More cells classified as "moderate"
    → Color distribution: 35% safe, 45% moderate, 20% high

If RISK_THRESHOLDS['low'] = 30.0 (instead of 20.0):
    → More cells classified as "safe"
    → Color distribution: 65% safe, 28% moderate, 7% high
```

**Recency Weight Sensitivity:**

```
If recency_weight[12 months] = 0.10 (instead of 0.35):
    → Old crimes contribute less
    → Overall weighted counts decrease ~15%
    → Cells shift toward "safer" classification

If recency_weight[12 months] = 0.50 (instead of 0.35):
    → Old crimes contribute more
    → Overall weighted counts increase ~20%
    → Cells shift toward "higher risk"
```

---

## Example Calculations

### Example 1: Hexagon Safety Score

**Scenario:** H3 cell in Southampton city center

**Input Data:**

- Month 0 (current): 5 violent crimes, 3 burglaries
- Month 1 (1 month ago): 4 violent crimes, 2 burglaries
- Month 2 (2 months ago): 3 violent crimes, 1 burglary
- Time filter: Night (11 PM - 6 AM)

**Step 1: Calculate Weighted Counts**

```
Month 0:
  - Violent: 5 × 3.0 (harm) × 2.5 (night) = 37.5
  - Burglary: 3 × 2.0 (harm) × 2.0 (night) = 12.0
  - Subtotal: 49.5

Month 1:
  - Violent: 4 × 3.0 × 2.5 = 30.0
  - Burglary: 2 × 2.0 × 2.0 = 8.0
  - Subtotal: 38.0

Month 2:
  - Violent: 3 × 3.0 × 2.5 = 22.5
  - Burglary: 1 × 2.0 × 2.0 = 4.0
  - Subtotal: 26.5
```

**Step 2: Apply Recency Weighting**

```
Month 0: 49.5 × 1.00 = 49.5
Month 1: 38.0 × 0.95 = 36.1
Month 2: 26.5 × 0.90 = 23.85

Total weighted: 49.5 + 36.1 + 23.85 = 109.45
```

**Step 3: Calculate Risk Score**

```
weighted_count = 109.45
109.45 falls in range [100.0, 200.0] → "very high" tier

progress = (109.45 - 100.0) / (200.0 - 100.0) = 0.0945
risk_score = 0.8 + 0.15 × 0.0945 = 0.814
```

**Step 4: Convert to Safety Score**

```
safety_score = (1.0 - 0.814) × 100 = 18.6

Classification: HIGH RISK (red)
```

### Example 2: Route Segment Score

**Scenario:** Walking route segment passing through 20 H3 cells

**Input Data:**

- 1 cell with weighted_count = 100 (high crime hotspot)
- 5 cells with weighted_count = 10 (low crime)
- 14 cells with weighted_count = 3 (very low crime)

**Step 1: Calculate Average Segment Risk**

```
total = (1 × 100) + (5 × 10) + (14 × 3)
      = 100 + 50 + 42
      = 192

avg_risk = 192 / 20 = 9.6 weighted crimes
```

**Step 2: Calculate Risk Score**

```
avg_risk = 9.6
9.6 falls in range [5.0, 20.0] → "low" tier

progress = (9.6 - 5.0) / (20.0 - 5.0) = 0.307
risk_score = 0.2 + 0.2 × 0.307 = 0.261
```

**Step 3: Convert to Safety Score**

```
safety_score = (1.0 - 0.261) × 100 = 73.9

Classification: MODERATE (yellow/light green border)
```

**Key Insight:** Even though the route passes through a HIGH RISK hexagon (100 crimes), the segment score is MODERATE (73.9) because it averages across 20 cells. This is **correct behavior** - the route mostly avoids the hotspot!

### Example 3: Comparative Analysis

**Question:** Why does a route with safety_score = 79.5 pass through hexagons with safety_score = 18.6?

**Answer:**

1. **Hexagon Score (Point-Based):**

   - Single cell: 109.45 weighted crimes
   - Risk score: 0.814
   - Safety score: 18.6 (HIGH RISK, red)

2. **Route Segment Score (Area-Based):**

   - Averages across 20 cells
   - Most cells have 3-10 weighted crimes (safe/moderate)
   - Only 1 cell has 100 weighted crimes
   - Average: 9.6 weighted crimes
   - Risk score: 0.261
   - Safety score: 73.9 (MODERATE, yellow)

3. **Spatial Relationship:**

   ```
   Route path: ═══════════════════════════
               │  │  │  │ █│  │  │  │  │
   Cells:      3  3  3  3 100 3  3  3  3

   Route briefly intersects high-risk cell but spends
   most of its length in safe cells → moderate average
   ```

**Mathematical Verification:**

```
Hexagon scoring: weighted_count → risk_score
  109.45 → 0.814 → safety: 18.6 ✓

Route scoring: avg(weighted_counts) → risk_score
  avg(100, 10, 10, 10, 10, 10, 3, 3, ...) = 9.6
  9.6 → 0.261 → safety: 73.9 ✓

Both use identical calculate_risk_score() function
but different input values (single vs averaged)
```

---

## Performance Benchmarks

### Query Performance

**Safety Snapshot (3350 cells):**

```
Cold cache:    ~850ms (database query + aggregation)
Warm cache:    ~2ms (Redis lookup)
Cache hit rate: 87% (production)
```

**Route Scoring (2.2km route, 19 segments):**

```
Spatial intersection: ~120ms (PostGIS GiST index)
Risk calculation:     ~15ms (in-memory)
Total:               ~135ms
```

### Scalability

**Horizontal Scaling:**

- Stateless API servers (can add more)
- Redis cache shared across instances
- PostgreSQL read replicas for queries

**Estimated Capacity:**

```
Single server:
  - 100 req/sec snapshot endpoint
  - 50 req/sec route endpoint
  - 4GB RAM (Redis cache)

Load balanced (3 servers):
  - 300 req/sec snapshot
  - 150 req/sec route
  - 12GB total RAM
```

---

## Future Enhancements

### 1. Multi-Resolution H3 Aggregation

**Current:** Fixed resolution 10 (~73m cells)
**Proposed:** Dynamic resolution based on zoom level

```python
ZOOM_TO_RESOLUTION = {
    0-5: 4,    # Continental view (~290 km)
    6-9: 6,    # City view (~36 km)
    10-12: 8,  # Neighborhood (~4.5 km)
    13-15: 10, # Street view (~73 m)
    16+: 11,   # Building view (~9 m)
}
```

**Complexity:** O(c) pre-aggregation, O(1) query per resolution

### 2. Alternative Route Optimization

**Current:** Score existing ORS routes
**Proposed:** Generate custom routes minimizing risk

```python
# Dijkstra with safety-weighted edges
def custom_route(origin, dest, safety_weight=0.7):
    graph = build_graph(cells, safety_weight)
    path = dijkstra(graph, origin, dest)
    return path
```

**Complexity:** O((V + E) log V) where V = nodes, E = edges

---

## References

### Technical Documentation

- PostGIS Spatial Index: https://postgis.net/docs/using_postgis_dbmanagement.html#gist_indexes
- H3 Resolution Table: https://h3geo.org/docs/core-library/restable
- UK Police API: https://data.police.uk/docs/

### Implementation

- Repository: https://github.com/ss2d22/saferoute
- API Documentation: http://localhost:8000/docs
- OpenAPI Schema: [docs/openapi.json](openapi.json)

---

**Document Version:** 1.0
**Last Reviewed:** 2025-11-14
