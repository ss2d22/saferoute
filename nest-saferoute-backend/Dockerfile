FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development

# Install curl for healthcheck
RUN apk add --no-cache curl

RUN npm install
COPY . .
CMD ["npm", "run", "start:dev"]

# Build stage
FROM base AS build

ARG NODE_ENV
ENV NODE_ENV=development

RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./

# Copy startup script
COPY scripts/start-production.sh ./scripts/start-production.sh
RUN chmod +x ./scripts/start-production.sh

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 8000

CMD ["./scripts/start-production.sh"]
