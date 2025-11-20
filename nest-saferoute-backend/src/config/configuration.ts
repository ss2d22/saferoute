export default () => ({
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8000', 10),
  app_name: process.env.APP_NAME || 'SafeRoute API',

  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    name: process.env.DATABASE_NAME || 'saferoute',
    username: process.env.DATABASE_USERNAME || 'saferoute',
    password:
      process.env.DATABASE_PASSWORD ||
      process.env.POSTGRES_PASSWORD ||
      'changeme',
    url:
      process.env.DATABASE_URL ||
      'postgresql://saferoute:changeme@localhost:5432/saferoute',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'changeme-in-production',
    accessTokenExpiration: process.env.JWT_ACCESS_TOKEN_EXPIRATION || '15m',
    refreshTokenExpiration: process.env.JWT_REFRESH_TOKEN_EXPIRATION || '30d',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    db: parseInt(process.env.REDIS_DB || '0', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    url: process.env.REDIS_URL || 'redis://localhost:6379/0',
  },

  externalApis: {
    orsApiKey: process.env.ORS_API_KEY || '',
    orsApiUrl: process.env.ORS_API_URL || 'https://api.openrouteservice.org',
    policeApiBaseUrl: process.env.POLICE_API_BASE_URL || 'https://data.police.uk/api',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:8080')
      .split(',')
      .map((origin) => origin.trim()),
  },

  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED === 'true',
    perMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10),
    authPerMinute: parseInt(process.env.RATE_LIMIT_AUTH_PER_MINUTE || '5', 10),
  },

  safety: {
    defaultLookbackMonths: parseInt(process.env.DEFAULT_LOOKBACK_MONTHS || '12', 10),
    defaultSafetyWeight: parseFloat(process.env.DEFAULT_SAFETY_WEIGHT || '0.8'),
    defaultRouteBufferM: parseInt(process.env.DEFAULT_ROUTE_BUFFER_M || '50', 10),
    maxRouteDistanceKm: parseInt(process.env.MAX_ROUTE_DISTANCE_KM || '100', 10),
  },

  grid: {
    cellSizeM: parseInt(process.env.GRID_CELL_SIZE_M || '73', 10),
    gridType: process.env.GRID_TYPE || 'h3_hexagonal',
    h3Resolution: parseInt(process.env.H3_RESOLUTION || '10', 10),
    southamptonBbox: process.env.SOUTHAMPTON_BBOX || '50.85,-1.55,51.0,-1.3',
  },

  history: {
    defaultRetentionDays: parseInt(process.env.DEFAULT_HISTORY_RETENTION_DAYS || '90', 10),
    maxRetentionDays: parseInt(process.env.MAX_HISTORY_RETENTION_DAYS || '365', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  admin: {
    apiKey: process.env.ADMIN_API_KEY || '',
  },
});
