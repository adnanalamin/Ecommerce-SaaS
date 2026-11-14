# DevOps, Infrastructure & Deployment Architecture
## Document Version: 1.0.0 — Phase 01 Master Architecture
**Platform**: NEXORA Multi-Tenant SaaS E-Commerce Store Builder  
**Author**: Principal Cloud Architect & Senior DevOps Engineer  
**Status**: APPROVED

---

## 1. High-Availability Production Topology

```mermaid
flowchart TB
    subgraph Traffic["Global Anycast Traffic Ingress"]
        Users["Global Users & Merchants"]
        CF["Cloudflare Enterprise Edge<br/>- Wildcard DNS (*.nexora.shop)<br/>- DDoS & Bot Mitigation<br/>- Global Edge CDN for Static Assets"]
    end

    subgraph IngressTier["Dynamic Edge & SSL Termination Tier"]
        NGX1["OpenResty / Nginx Ingress Node 01<br/>- Lua ACME Let's Encrypt Handler<br/>- Automatic SSL for Custom Domains"]
        NGX2["OpenResty / Nginx Ingress Node 02<br/>- High Availability Keepalived Failover"]
    end

    subgraph AppCluster["Application Container Cluster (Docker / Kubernetes / ECS)"]
        subgraph APINodes["Node.js + Express API Pods"]
            API1["API Pod 1"]
            API2["API Pod 2"]
            API3["API Pod N (Horizontal Autoscaling)"]
        end
        subgraph WorkerNodes["BullMQ Asynchronous Background Workers"]
            W1["Payment Settlement Worker"]
            W2["Notification Dispatch Worker (SMS/Email)"]
            W3["SSL Auto-Issuance Worker"]
        end
    end

    subgraph CacheDB["Persistence & Distributed State Tier"]
        REDIS[("Redis In-Memory Cluster<br/>Primary-Replica + Sentinel Failover<br/>- Shared Cache<br/>- Distributed Locks<br/>- BullMQ Queues")]
        MONGO[("MongoDB Atlas Replica Set (M30+)<br/>- 1 Primary, 2 Secondaries<br/>- Continuous Backup (PITR)<br/>- Majority Write Concern")]
    end

    subgraph Storage["Cloud Media Storage"]
        S3[("AWS S3 / Cloudflare R2<br/>- Merchant Logos & Product Photography<br/>- CDN Asset Distribution<br/>- Cross-Region Replication")]
    end

    Users --> CF --> NGX1 & NGX2
    NGX1 & NGX2 --> APINodes
    APINodes <--> REDIS
    APINodes --> REDIS
    REDIS --> WorkerNodes
    APINodes <--> MONGO
    WorkerNodes <--> MONGO
    APINodes <--> S3
```

---

## 2. Dynamic SSL Provisioning for Custom Merchant Domains

One of the most complex challenges in multi-tenant SaaS is provisioning valid SSL/TLS certificates for customer-owned domains (`store.artisan.bd`) without human intervention or server downtime.

```mermaid
sequenceDiagram
    autonumber
    actor Merchant as Store Owner
    participant Dash as NEXORA Admin Dashboard
    participant API as Express Domain Service
    participant DNS as Public DNS System
    participant OpenResty as OpenResty Ingress (lua-resty-auto-ssl)
    participant LE as Let's Encrypt ACME CA

    Merchant->>Dash: Inputs Custom Domain ("store.artisan.bd")
    Dash->>API: POST /api/v1/tenant/domains/custom
    API->>API: Generate Verification Token ("nexora-verify=8f192b...")
    API-->>Dash: Show CNAME instruction: "store.artisan.bd CNAME domains.nexora.shop"
    
    Merchant->>DNS: Configures DNS CNAME record at domain registrar
    Merchant->>Dash: Clicks "Verify DNS Configuration"
    Dash->>API: POST /api/v1/tenant/domains/verify
    API->>DNS: Resolve CNAME for "store.artisan.bd"
    
    alt DNS Validated
        API->>API: Update domain record status: "VERIFIED"
        API-->>Dash: Status: Active (SSL will issue on first request)
    else DNS Not Ready
        API-->>Dash: Status: Pending Propagation (Retry in 5m)
    end

    Note over OpenResty, LE: Automated TLS Handshake on First Shopper Visit
    actor Shopper as Customer Browser
    Shopper->>OpenResty: TLS ClientHello for "store.artisan.bd"
    OpenResty->>OpenResty: Check local certificate cache
    alt Certificate Missing
        OpenResty->>API: HTTP Call to Internal Verification Endpoint: "Is store.artisan.bd a verified tenant?"
        API-->>OpenResty: Status: TRUE (Authorized Tenant)
        OpenResty->>LE: Execute ACME HTTP-01 Challenge on the fly
        LE-->>OpenResty: Issue signed X.509 SSL Certificate
        OpenResty->>OpenResty: Cache certificate in Redis (TTL: 90 days)
    end
    OpenResty-->>Shopper: Complete TLS Handshake with Valid Certificate (Padlock Verified)
```

---

## 3. Production Dockerfile Multi-Stage Blueprint

```dockerfile
# Multi-Stage Production Build for NEXORA Full-Stack Server
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm ci --only=production --prefer-offline && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.js"]
```

---

## 4. Disaster Recovery & Business Continuity Plan

| Metric | Target SLA | Strategy & Implementation |
| :--- | :--- | :--- |
| **Recovery Point Objective (RPO)** | **< 5 Minutes** | Continuous MongoDB Atlas Oplog tailing with Point-in-Time Recovery (PITR); AWS S3 / Cloudflare R2 bucket versioning. |
| **Recovery Time Objective (RTO)** | **< 30 Minutes** | Infrastructure as Code (Terraform) scripts capable of reprovisioning the complete container cluster in any secondary AWS/GCP region automatically. |
| **Database Failover** | **< 10 Seconds** | MongoDB 3-node replica set automatically elects a new primary in under 10 seconds if the leader degrades. |
| **Backup Cadence** | **Hourly Snapshots** | Automated hourly delta snapshots retained for 30 days, daily snapshots retained for 90 days, monthly snapshots retained for 1 year in cold archive storage. |
