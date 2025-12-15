"""Scoring utilities for safety and risk calculations.

Functions for calculating safety scores from crime data with support for
recency weighting, time-of-day adjustments, and normalization.
"""

from datetime import date, datetime

from dateutil.relativedelta import relativedelta


def get_recency_weight(months_ago: int) -> float:
    """Returns weight factor based on crime age.

    Recent crimes are weighted higher than older ones.

    Args:
        months_ago: Number of months since the crime occurred

    Returns:
        Weight factor between 0.25 and 1.0
    """
    if months_ago <= 3:
        return 1.0
    elif months_ago <= 6:
        return 0.75
    elif months_ago <= 12:
        return 0.5
    else:
        return 0.25


def get_time_bucket(dt: datetime) -> str:
    """Classify time into one of four daily periods.

    Args:
        dt: Datetime to classify

    Returns:
        "night" (22:00-06:00), "morning" (06:00-09:00),
        "day" (09:00-17:00), or "evening" (17:00-22:00)
    """
    hour = dt.hour

    if 22 <= hour or hour < 6:
        return "night"
    elif 6 <= hour < 9:
        return "morning"
    elif 9 <= hour < 17:
        return "day"
    else:  # 17 <= hour < 22
        return "evening"


def get_time_weight(crime_bucket: str, user_bucket: str) -> float:
    """Weight crimes based on time bucket matching.

    Crimes that occurred in the same time period as the user's planned
    travel time are weighted higher.

    Args:
        crime_bucket: Time period when the crime occurred
        user_bucket: Time period when user plans to travel

    Returns:
        1.5 if buckets match, 0.8 otherwise
    """
    if crime_bucket == user_bucket:
        return 1.5  # Emphasize crimes in same time bucket
    else:
        return 0.8  # De-emphasize crimes in different time buckets


def calculate_months_ago(crime_month: date, current_month: date) -> int:
    """Number of months between two dates.

    Args:
        crime_month: Earlier date (month of crime)
        current_month: Later date (usually today)

    Returns:
        Number of complete months between dates
    """
    delta = relativedelta(current_month, crime_month)
    return delta.years * 12 + delta.months


def normalize_score(value: float, min_val: float, max_val: float) -> float:
    """Scale value to 0-1 range.

    Args:
        value: Value to scale
        min_val: Range minimum
        max_val: Range maximum

    Returns:
        Value scaled to [0, 1], or 0.5 if min equals max
    """
    if max_val == min_val:
        return 0.5
    return (value - min_val) / (max_val - min_val + 1e-9)


def risk_to_safety_score(risk: float) -> float:
    """Convert risk to safety score (inverse relationship).

    Args:
        risk: Risk value from 0 to 1 (higher = more dangerous)

    Returns:
        Safety score from 0 to 100 (higher = safer)
    """
    safety = (1.0 - risk) * 100
    return max(0, min(100, safety))
