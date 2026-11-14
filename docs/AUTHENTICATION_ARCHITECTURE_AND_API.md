# NEXORA Phase 06 — Authentication Architecture & API Reference

## 1. Security Architecture Overview

| Control | Implementation | Details |
| :--- | :--- | :--- |
| **Password Hashing** | Argon2id (`argon2`) | Memory-hard PHC (`m=64 MiB`, `t=3`, `p=1`), 128-char DoS cap, password strength policy enforced on register/reset/change. |
| **Session & Token Model** | Server-Managed Sessions + Short-Lived Access JWT (`jose`) + Rotating Refresh Token | Access token (`15m`, HS256 JWT containing `sub`, `sid`, `role`, `tv`) + opaque refresh credential (`7d`) stored as SHA-256 hash (`currentRefreshTokenHash`) in `auth_sessions`. |
| **Cookie Transport** | `HttpOnly`, `SameSite=Lax`, Signed (`COOKIE_SECRET`) | Production enables `Secure` and `__Host-` cookie prefix (`__Host-nexora_session`, `__Host-nexora_refresh`). Tokens are **never** returned in JSON bodies or stored in `localStorage`. |
| **CSRF Protection** | Signed Double-Submit Cookie + `Sec-Fetch-Site` | Cookie-authenticated mutations require matching `nexora_csrf` cookie + `X-CSRF-Token` HMAC-signed header. |
| **Refresh Replay Detection** | Token Rotation + Family Revocation | Reusing a rotated-out refresh token triggers `401 REFRESH_TOKEN_REUSED`, revokes the entire session immediately, and logs a `CRITICAL` security event. |
| **Instant Revocation** | `requireAuth` DB/Store Session Check + `tokenVersion` | Every authenticated request verifies `AuthSession.isRevoked === false`, non-expiry, `user.status === 'ACTIVE'`, and `user.tokenVersion === jwt.tv`. |
| **Brute-Force Lockout** | Tiered Rate Limiter + Account Lockout | `authRateLimiter` (15 req / 15 min per IP) + 5 consecutive failed logins locks the account for 15 minutes (`423 ACCOUNT_LOCKED`). |
| **MFA / TOTP** | RFC 6238 TOTP (`node:crypto`) + 8 Single-Use Backup Codes | Base32 secrets encrypted at rest with AES-256-GCM (`user.id` HKDF context). Backup codes stored as SHA-256 hashes and consumed once. |
| **Suspicious Login Detection** | Heuristic Metadata Analysis + `login_history` | Flags `NEW_IP_ADDRESS`, `NEW_DEVICE_USER_AGENT`, and `RECENT_FAILED_ATTEMPTS`, persisted to `login_history` with parsed device labels. |

---

## 2. Cookie Specification

| Cookie Name (Dev / Prod) | Flags | TTL | Purpose |
| :--- | :--- | :--- | :--- |
| `nexora_session` / `__Host-nexora_session` | `HttpOnly`, `SameSite=Lax`, `Signed`, `Path=/`, `Secure` (prod) | 15 minutes | Short-lived access JWT |
| `nexora_refresh` / `__Host-nexora_refresh` | `HttpOnly`, `SameSite=Lax`, `Signed`, `Path=/`, `Secure` (prod) | 7 days | Rotating opaque session refresh token (`sid.secret`) |
| `nexora_csrf` | `SameSite=Lax`, `Path=/`, `Secure` (prod), HMAC-signed | 24 hours | Double-submit CSRF token echoed by SPA in `X-CSRF-Token` |

---

## 3. API Endpoints (`/api/v1/auth`)

### Public & Pre-Auth Endpoints

#### `GET /api/v1/auth/csrf`
Issues a fresh `nexora_csrf` cookie and returns `{ data: { csrfToken } }`.

#### `POST /api/v1/auth/register` *(Rate-Limited)*
- **Body (`.strict()`)**: `{ fullName, email, password, phone?, accountType?: 'CUSTOMER' | 'MERCHANT' }`
- **Security**: Rejects arbitrary roles (`PLATFORM_SUPER_ADMIN`, etc.) with `422 VALIDATION_ERROR`.
- **Responses**: `201 Created` (`{ user, requiresEmailVerification: true, expiresAt }`), `400 Bad Request` (weak password), `409 Conflict` (`EMAIL_ALREADY_EXISTS`).

#### `POST /api/v1/auth/verify-email`
- **Body**: `{ token }`
- **Responses**: `200 OK` (`{ verified: true, user }`), `400 INVALID_VERIFICATION_TOKEN` (invalid, consumed, or expired).

#### `POST /api/v1/auth/resend-verification` *(Rate-Limited)*
- **Body**: `{ email }`
- **Responses**: `200 OK` (enumeration-safe generic confirmation).

#### `POST /api/v1/auth/login` *(Rate-Limited)*
- **Body**: `{ email, password }`
- **Responses**:
  - `200 OK` (No MFA): Sets `nexora_session`, `nexora_refresh`, `nexora_csrf` cookies; returns `{ user, sessionId, expiresAt, suspiciousSignals, csrfToken }`.
  - `200 OK` (MFA Enabled): Returns `{ mfaRequired: true, mfaTicket, methods: ['TOTP', 'BACKUP_CODE'], csrfToken }`.
  - `401 INVALID_CREDENTIALS` | `403 EMAIL_NOT_VERIFIED` | `403 ACCOUNT_SUSPENDED` | `423 ACCOUNT_LOCKED`.

#### `POST /api/v1/auth/mfa/verify-login` *(Rate-Limited)*
- **Body**: `{ mfaTicket, code }` (6-digit TOTP or `XXXX-XXXX` single-use backup code)
- **Responses**: `200 OK` (issues session cookies + CSRF), `401 INVALID_MFA_TICKET` | `401 INVALID_MFA_CODE`.

#### `POST /api/v1/auth/refresh` *(Cookie + CSRF Required)*
- **Headers**: `X-CSRF-Token: <nexora_csrf>`
- **Responses**:
  - `200 OK`: Rotates `nexora_refresh` + `nexora_session` + `nexora_csrf` cookies.
  - `401 REFRESH_TOKEN_REUSED`: Revokes session immediately and clears auth cookies.
  - `401 SESSION_REVOKED` | `401 SESSION_EXPIRED`.

#### `POST /api/v1/auth/forgot-password` *(Rate-Limited)*
- **Body**: `{ email }`
- **Responses**: `200 OK` (`{ requested: true }`; enumeration-safe).

#### `POST /api/v1/auth/reset-password` *(Rate-Limited)*
- **Body**: `{ token, newPassword }`
- **Responses**: `200 OK` (`{ reset: true }`; revokes all existing sessions and bumps `tokenVersion`), `400 INVALID_RESET_TOKEN`.

---

### Authenticated Account, MFA & Device Endpoints (`requireAuth`)

| Method & Path | CSRF Required | Description |
| :--- | :--- | :--- |
| `GET /api/v1/auth/me` | No | Returns authenticated user profile, current `sessionId`, and fresh `csrfToken`. |
| `POST /api/v1/auth/logout` | Yes | Revokes current session (`USER_LOGOUT`) and clears auth cookies. |
| `POST /api/v1/auth/logout-all` | Yes | Revokes all sessions, increments `tokenVersion`, and clears auth cookies. |
| `POST /api/v1/auth/change-password` | Yes | Verifies `currentPassword`, hashes `newPassword` with Argon2id, and revokes all sibling sessions. |
| `GET /api/v1/auth/sessions` | No | Lists all active non-revoked sessions/devices for the user (`isCurrent` flagged). |
| `DELETE /api/v1/auth/sessions/:sessionId` | Yes | Remotely revokes a specific device session. |
| `GET /api/v1/auth/login-history` | No | Returns up to 25 recent authentication events with `status`, IP, device label, and `suspiciousSignals`. |
| `POST /api/v1/auth/mfa/setup` | Yes | Generates encrypted TOTP secret and `otpauth://` provisioning URI. |
| `POST /api/v1/auth/mfa/confirm` | Yes | Verifies initial 6-digit TOTP `{ code }`, enables MFA, and returns 8 single-use backup codes once. |
| `POST /api/v1/auth/mfa/disable` | Yes | Verifies `{ password, code }` and disables MFA. |
| `POST /api/v1/auth/mfa/backup-codes/regenerate` | Yes | Verifies `{ password }` and rotates all 8 hashed single-use backup codes. |
| `ALL /api/v1/auth/verify` | No (dev/suite) | Executes automated 11-scenario authentication test suite. |
