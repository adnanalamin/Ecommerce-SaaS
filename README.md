# NEXORA — Multi-Tenant SaaS E-Commerce Platform

NEXORA is a high-performance, multi-tenant SaaS e-commerce store builder with sovereign merchant storefronts, strict data isolation, dynamic custom theming, and localized payment gateway orchestration (Bangladesh domestic & international).

---

## 1. Project Monorepo Structure

```text
├── packages/
│   ├── common/                       # Shared types, Zod schemas, system constants
│   │   ├── src/
│   │   │   ├── types/index.ts        # UserRole, TenantStatus, ApiResponse, Health types
│   │   │   ├── validation/index.ts   # Zod validation schemas (TenantRegistration, Pagination)
│   │   │   ├── constants/index.ts    # Reserved subdomains, supported currencies
│   │   │   └── index.ts
│   ├── config/                       # Centralized configuration & environment loader
│   │   ├── src/
│   │   │   ├── env.ts                # Zod-validated environment config with dev/prod guards
│   │   │   └── index.ts
├── src/
│   ├── server/                       # Backend (Node.js + Express + TypeScript)
│   │   ├── config/
│   │   │   └── database.ts           # Mongoose replica connection pool & health checks
│   │   ├── middleware/
│   │   │   ├── cors.ts               # Secure CORS allowlist middleware
│   │   │   ├── errorHandler.ts       # Centralized error handler (Zod, Mongo, AppError)
│   │   │   ├── requestLogger.ts      # HTTP request logging with trace IDs
│   │   │   └── tenantContext.ts      # AsyncLocalStorage tenant resolver
│   │   ├── routes/
│   │   │   ├── health.ts             # /api/health and /api/v1/health endpoints
│   │   │   └── v1/index.ts           # API v1 aggregator
│   │   ├── utils/
│   │   │   ├── apiResponse.ts        # Standardized { success, data, error, meta } envelope
│   │   │   ├── errors.ts             # AppError hierarchy
│   │   │   └── logger.ts             # Structured level logger (info, warn, error, debug)
│   │   └── app.ts                    # Express application factory
│   ├── App.tsx                       # Frontend React UI & Live Architecture Explorer
│   ├── main.tsx                      # Frontend client entry point
│   └── index.css                     # Global Tailwind CSS tokens
├── docs/                             # 11 Master Phase 01 Architecture Specifications
├── docker-compose.yml                # Development compose (MongoDB replica set + Redis + App)
├── Dockerfile                        # Multi-stage production container
├── server.ts                         # Full-stack server entry point (Express + Vite middleware)
├── tsconfig.json                     # Strict TypeScript configuration
└── package.json
```

---

## 2. Windows PowerShell Commands

### A. Initial Setup & Dependencies
```powershell
# Clone repository and enter directory
cd nexora-platform

# Install locked dependencies
npm ci
```

### B. Environment Configuration
```powershell
# Copy the example environment file to .env
Copy-Item .env.example .env

# (Optional) Verify environment variables
Get-Content .env
```

### C. Running MongoDB & Redis via Docker
```powershell
# Launch single-node MongoDB replica set (with ACID transaction support) and Redis
docker compose up -d mongo redis

# Check container health status
docker compose ps
```

### D. Starting Full-Stack Development Server
```powershell
# Starts Express backend and Vite frontend middleware on port 3000
npm run dev

# Open your browser at:
# Application Portal: http://localhost:3000
# Live Health Check:  http://localhost:3000/api/health
# API v1 Directory:   http://localhost:3000/api/v1
```

### E. Code Quality & Type Checking
```powershell
# Run strict TypeScript type checking across entire monorepo
npm run lint

# Clean build artifacts
npm run clean
```

### F. Building for Production
```powershell
# Builds frontend assets to /dist
npm run build

# Start production server
npm run start
```

---

## 3. Environment Variables Reference

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `development` | Runtime environment (`development`, `test`, `production`) |
| `PORT` | Number | `3000` | Port for the full-stack server |
| `APP_URL` | URL | `http://localhost:3000` | Public URL of the service |
| `MONGODB_URI` | Connection String | `mongodb://localhost:27017/nexora_dev` | MongoDB connection URI |
| `REDIS_URL` | Connection String | `redis://localhost:6379` | Redis cache and BullMQ connection |
| `JWT_ACCESS_SECRET` | String | Minimum 16 chars | Cryptographic secret for short-lived access JWTs |
| `JWT_REFRESH_SECRET` | String | Minimum 16 chars | Cryptographic secret for refresh tokens |
| `COOKIE_SECRET` | String | Minimum 16 chars | Cookie signing secret |
| `CORS_ALLOWED_ORIGINS` | Comma-separated | `http://localhost:3000` | Whitelisted frontend origins |

---

## 4. API Endpoints (Phase 02 Baseline)

### `GET /api/health`
Returns system health, server uptime, Node memory usage, and MongoDB connection status.
```json
{
  "success": true,
  "data": {
    "status": "UP",
    "timestamp": "2026-11-10T05:27:00.000Z",
    "uptimeSeconds": 142,
    "environment": "development",
    "version": "1.0.0",
    "services": {
      "database": {
        "status": "UP",
        "responseTimeMs": 3,
        "message": "MongoDB replica connection healthy"
      },
      "memory": {
        "rssMB": 68.4,
        "heapTotalMB": 44.1,
        "heapUsedMB": 28.7
      }
    }
  }
}
```

### `GET /api/v1`
API v1 directory and tenant context discovery endpoint.

---

## 5. Security & Isolation Foundation
- **Argon2id** password hashing baseline.
- **Dual-token** session model with `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- **Zod validation** on all incoming payloads before controller execution.
- **AsyncLocalStorage** for thread-safe tenant context propagation.
- **Strict CORS** allowlisting with wildcard subdomain verification.
