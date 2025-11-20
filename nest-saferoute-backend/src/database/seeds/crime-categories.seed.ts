/**
 * Crime categories with harm weights based on Cambridge Crime Harm Index (CCHI)
 * and UK sentencing guidelines
 *
 * CCHI uses days of imprisonment as harm weights. Values are scaled from actual
 * sentencing guidelines (divided by 10 for practical use):
 * - Violence/sexual offences: ~750 days avg (serious assault, sexual offenses)
 * - Robbery: ~730 days (2 years typical sentence)
 * - Weapons: ~365 days (1 year)
 * - Burglary: ~18.75 days (150 hours unpaid work equivalent)
 * - Vehicle crime: ~90 days (3 months typical)
 * - Drugs: ~180 days (6 months, varies widely)
 * - Theft from person: ~90 days
 * - Criminal damage: ~90 days (varies by severity)
 * - Public order: ~30 days
 * - Bicycle theft: ~2 days (Band C fine equivalent)
 * - Other theft: ~50 days average
 * - Shoplifting: ~1 day (Band B fine equivalent)
 * - Anti-social behaviour: ~0.5 day (civil penalty equivalent)
 */
export const CRIME_CATEGORIES = [
  {
    id: 'anti-social-behaviour',
    name: 'Anti-social behaviour',
    harmWeightDefault: 0.5,
    isPersonal: false,
    isProperty: false,
  },
  {
    id: 'bicycle-theft',
    name: 'Bicycle theft',
    harmWeightDefault: 2.0,
    isPersonal: false,
    isProperty: true,
  },
  {
    id: 'burglary',
    name: 'Burglary',
    harmWeightDefault: 18.75,
    isPersonal: false,
    isProperty: true,
  },
  {
    id: 'criminal-damage-arson',
    name: 'Criminal damage and arson',
    harmWeightDefault: 9.0,
    isPersonal: false,
    isProperty: true,
  },
  {
    id: 'drugs',
    name: 'Drugs',
    harmWeightDefault: 18.0,
    isPersonal: false,
    isProperty: false,
  },
  {
    id: 'other-theft',
    name: 'Other theft',
    harmWeightDefault: 5.0,
    isPersonal: false,
    isProperty: true,
  },
  {
    id: 'possession-of-weapons',
    name: 'Possession of weapons',
    harmWeightDefault: 36.5,
    isPersonal: true,
    isProperty: false,
  },
  {
    id: 'public-order',
    name: 'Public order',
    harmWeightDefault: 3.0,
    isPersonal: true,
    isProperty: false,
  },
  {
    id: 'robbery',
    name: 'Robbery',
    harmWeightDefault: 73.0,
    isPersonal: true,
    isProperty: true,
  },
  {
    id: 'shoplifting',
    name: 'Shoplifting',
    harmWeightDefault: 1.0,
    isPersonal: false,
    isProperty: true,
  },
  {
    id: 'theft-from-the-person',
    name: 'Theft from the person',
    harmWeightDefault: 9.0,
    isPersonal: true,
    isProperty: true,
  },
  {
    id: 'vehicle-crime',
    name: 'Vehicle crime',
    harmWeightDefault: 9.0,
    isPersonal: false,
    isProperty: true,
  },
  {
    id: 'violent-crime',
    name: 'Violence and sexual offences',
    harmWeightDefault: 75.0,
    isPersonal: true,
    isProperty: false,
  },
  {
    id: 'other-crime',
    name: 'Other crime',
    harmWeightDefault: 5.0,
    isPersonal: false,
    isProperty: false,
  },
];
