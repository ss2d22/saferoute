#!/usr/bin/env python3
"""Populate crime categories in the database.

This script inserts all UK Police API crime categories into the crime_categories table
with appropriate harm weights and classification flags.
"""
import sys

# Add parent directory to path
sys.path.insert(0, '/app')

from app.db.base import SessionLocal
from app.models import CrimeCategory

# Crime categories with harm weights based on Cambridge Crime Harm Index
# and UK crime severity classifications
CRIME_CATEGORIES = [
    {
        'id': 'anti-social-behaviour',
        'name': 'Anti-social behaviour',
        'harm_weight_default': 1.0,
        'is_personal': False,
        'is_property': False,
    },
    {
        'id': 'bicycle-theft',
        'name': 'Bicycle theft',
        'harm_weight_default': 2.5,
        'is_personal': False,
        'is_property': True,
    },
    {
        'id': 'burglary',
        'name': 'Burglary',
        'harm_weight_default': 4.5,
        'is_personal': False,
        'is_property': True,
    },
    {
        'id': 'criminal-damage-arson',
        'name': 'Criminal damage and arson',
        'harm_weight_default': 3.0,
        'is_personal': False,
        'is_property': True,
    },
    {
        'id': 'drugs',
        'name': 'Drugs',
        'harm_weight_default': 3.5,
        'is_personal': False,
        'is_property': False,
    },
    {
        'id': 'other-theft',
        'name': 'Other theft',
        'harm_weight_default': 2.0,
        'is_personal': False,
        'is_property': True,
    },
    {
        'id': 'possession-of-weapons',
        'name': 'Possession of weapons',
        'harm_weight_default': 5.5,
        'is_personal': True,
        'is_property': False,
    },
    {
        'id': 'public-order',
        'name': 'Public order',
        'harm_weight_default': 2.5,
        'is_personal': True,
        'is_property': False,
    },
    {
        'id': 'robbery',
        'name': 'Robbery',
        'harm_weight_default': 7.0,
        'is_personal': True,
        'is_property': True,
    },
    {
        'id': 'shoplifting',
        'name': 'Shoplifting',
        'harm_weight_default': 1.5,
        'is_personal': False,
        'is_property': True,
    },
    {
        'id': 'theft-from-the-person',
        'name': 'Theft from the person',
        'harm_weight_default': 3.0,
        'is_personal': True,
        'is_property': True,
    },
    {
        'id': 'vehicle-crime',
        'name': 'Vehicle crime',
        'harm_weight_default': 3.5,
        'is_personal': False,
        'is_property': True,
    },
    {
        'id': 'violent-crime',
        'name': 'Violence and sexual offences',
        'harm_weight_default': 8.0,
        'is_personal': True,
        'is_property': False,
    },
    {
        'id': 'other-crime',
        'name': 'Other crime',
        'harm_weight_default': 2.0,
        'is_personal': False,
        'is_property': False,
    },
]


def populate_categories():
    """Populate crime categories in the database."""
    db = SessionLocal()

    try:
        print("=" * 70)
        print("Populating Crime Categories")
        print("=" * 70)
        print()

        inserted = 0
        skipped = 0

        for category_data in CRIME_CATEGORIES:
            # Check if category already exists
            existing = db.query(CrimeCategory).filter_by(id=category_data['id']).first()

            if existing:
                print(f"⊘ {category_data['name']} (already exists)")
                skipped += 1
            else:
                category = CrimeCategory(**category_data)
                db.add(category)
                print(f"✓ {category_data['name']} (weight: {category_data['harm_weight_default']})")
                inserted += 1

        db.commit()

        print()
        print("=" * 70)
        print("Summary")
        print("=" * 70)
        print(f"  ✓ Inserted: {inserted}")
        print(f"  ⊘ Skipped: {skipped}")
        print(f"  Total: {len(CRIME_CATEGORIES)}")
        print()

        return 0

    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        db.rollback()
        return 1

    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(populate_categories())
