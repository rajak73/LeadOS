# 19 — Security Design

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-4, P0-7).** Refresh-cookie model corrected for a same-site deployment topology (§19.1); application-level field encryption scope corrected to OAuth tokens only — PII (email/phone) is protected by storage-layer encryption so it remains indexable/searchable (§19.3, §19.9). Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 19.1 Authentication Architecture

### JWT Strategy
```
Access Token:
  - Algorithm: HS256 (HMAC SHA-256)
  - Expiry: 15 minutes
  - Payload: { sub: userId, orgId: organizationId, role: roleName, iat, exp }
  - Secret: min 256-bit random string, rotated every 90 days
  - NOT stored client-side in localStorage — stored in memory (React state)

Refresh Token:
  - Algorithm: Opaque random token (not JWT)
  - Format: 48 bytes, cryptographically random (crypto.randomBytes(48).toString('hex'))
  - Storage: HttpOnly, Secure, SameSite=Strict cookie, Path=/api/v1/auth
  - Expiry: 7 days (extends to 30 days if "Remember me" selected)
  - DB storage: tokenHash (SHA-256 of actual token) in refresh_tokens table
  - Rotation: New refresh token issued on every use (old one invalidated)
```

### Deployment Topology Requirement (P0-4 — corrected)
The refresh cookie ONLY works if the web app and API are **same-site** (share one
registrable domain / eTLD+1). They are therefore served as:
  - Web:  `app.leados.app`   (custom domain in front of Vercel)
  - API:  `api.leados.app`   (custom domain in front of Railway/ECS)
Because both share eTLD+1 `leados.app`, requests between them are same-site and the
`SameSite=Strict` refresh cookie is sent. A cross-registrable-domain split (e.g. Vercel
domain ↔ `*.up.railway.app`) would NOT send the cookie and is prohibited.

**Authenticated server-side rendering (BFF):** React Server Components cannot read the
in-memory access token. Authenticated data fetching for RSC pages goes through a thin
**Next.js BFF** (route handlers on `app.leados.app`) that holds the session server-side
and proxies to the API. This also keeps the cookie first-party to the web origin.

**CSRF:** the refresh endpoint relies on a cookie, so it additionally requires an
Origin/Referer check and a custom request header (defense in depth even under
SameSite=Strict). Access-token-bearing requests use the `Authorization` header and are
not cookie-driven, so they are not CSRF-exposed.

### Token Refresh Flow
```
[1] Access token expires
[2] Axios interceptor detects 401 response
[3] Frontend sends: POST /api/v1/auth/refresh (cookie auto-attached by browser)
[4] Backend:
    a. Read refresh token from cookie
    b. Hash it: SHA-256(token)
    c. Look up in DB: tokenHash, family, expiresAt, revokedAt, usedAt
    d. Validate: not expired, not revoked, not already used
    e. Issue new access token + new refresh token (new hash, same family)
    f. Mark old refresh token: usedAt = now
    g. Set new refresh token cookie (HttpOnly)
[5] Retry original request with new access token
[6] If refresh fails → redirect to login
```

### Refresh Token Rotation Attack Detection
```
If a refresh token that was already USED is presented again:
  → Token family reuse attack detected
  → Revoke ALL tokens in the same family (family = initial login session)
  → Log security alert
  → Send email to user: "Suspicious login detected"
  → User must re-authenticate
```

---

## 19.2 Password Security

```typescript
// Hashing: bcrypt with cost factor 12
const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

// Verification: timing-safe comparison
const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash); // bcrypt.compare is timing-safe
};

// Password requirements:
// - Minimum 8 characters
// - At least 1 uppercase letter
// - At least 1 lowercase letter
// - At least 1 number
// - At least 1 special character (!@#$%^&*)
// - Cannot contain email address
// - Validated with Zod regex on both frontend and backend
```

---

## 19.3 Encryption at Rest

### Sensitive Fields (Application-Level Encryption)
Encrypted before storing in DB, decrypted after reading. **Scope is LIMITED to OAuth
tokens** (P0-7): application-level field encryption is only applied where the value is
never searched, filtered, or deduplicated on:
- `InstagramAccount.accessToken`
- `WhatsAppAccount.accessToken`

**PII (email, phone) is NOT application-level encrypted.** It is protected by
storage-layer encryption (see below) and remains a plaintext, indexable column so that
lead/contact **dedup, full-text search, and trigram matching** (doc 08, doc 10) work.
Encrypting these columns at the application layer would make those core features
impossible. PII is still masked in logs (doc 18) and in audit before/after snapshots
(doc 08 §8.6).

```typescript
// core/crypto/fieldEncryption.ts

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.FIELD_ENCRYPTION_KEY!, 'hex'); // 32 bytes

export const encrypt = (plaintext: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const tag = cipher.getAuthTag();
  
  // Store: iv (32 hex) + tag (32 hex) + encrypted (hex)
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
};

export const decrypt = (ciphertext: string): string => {
  const iv = Buffer.from(ciphertext.substring(0, 32), 'hex');
  const tag = Buffer.from(ciphertext.substring(32, 64), 'hex');
  const encrypted = Buffer.from(ciphertext.substring(64), 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  
  return decipher.update(encrypted) + decipher.final('utf8');
};
```

### Database Encryption at Rest
- Neon PostgreSQL: encrypted storage volumes (AES-256) by default
- No additional configuration required — Neon manages this

---

## 19.4 Webhook Security

### Instagram Webhook Verification
Every incoming POST verified using HMAC-SHA256 before processing:
```typescript
const expected = crypto
  .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET!)
  .update(rawBody)
  .digest('hex');

const received = req.headers['x-hub-signature-256'].split('=')[1];

// MUST use timing-safe comparison to prevent timing attacks
const isValid = crypto.timingSafeEqual(
  Buffer.from(expected, 'hex'),
  Buffer.from(received, 'hex')
);
```

### Stripe Webhook Verification
```typescript
const event = stripe.webhooks.constructEvent(
  rawBody,           // Buffer (not parsed JSON)
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET!
);
// Stripe internally uses HMAC-SHA256 + timestamp tolerance (5 minutes)
```

### Webhook Idempotency
- All webhooks stored in `webhook_events` before processing
- Unique constraint: `(source, externalEventId)`
- If same event received twice → second insert fails → event skipped (idempotent)

---

## 19.5 Security Headers (Helmet.js)

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'nonce-{nonce}'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.leados.com", "wss://api.leados.com"],
      frameSrc: ["https://js.stripe.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: 'DENY',
  noSniff: true,
}));
```

---

## 19.6 Rate Limiting

```typescript
// core/middleware/rateLimiter.ts

// General API rate limit (per org)
const apiLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl_api',
  points: 100,      // Requests
  duration: 60,     // Per 60 seconds
  blockDuration: 60, // Block for 60s on exceed
});

// Auth-specific rate limit (per IP + email combination)
const authLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl_auth',
  points: 5,
  duration: 900,    // 15 minutes
  blockDuration: 900,
});

// Webhook rate limit (per IP)
const webhookLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl_webhook',
  points: 10000,
  duration: 900,
  blockDuration: 60,
});
```

---

## 19.7 CORS Configuration

> **P0-4 reconciliation:** the allow-list below must be the final same-site origins
> (`https://app.leados.app`, `https://www.leados.app`), matching the deployment topology
> in §19.1. `credentials: true` is required for the refresh cookie. Any `*.up.railway.app`
> or cross-registrable-domain origin is removed.

```typescript
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.CORS_ORIGIN,        // Frontend URL
      'https://app.leados.com',
      'https://www.leados.com',
    ].filter(Boolean);
    
    // Allow no origin (Postman, mobile apps) in dev only
    if (!origin && process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true, // Required for cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id'],
  exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // Preflight cache 24h
}));
```

---

## 19.8 SQL Injection Prevention

- **No raw SQL** in application code (all queries via Prisma client)
- Prisma uses parameterized queries for all operations
- For the rare `$queryRaw` / `$executeRaw` usages: use Prisma.sql template tag (parameterized)
- Regular SQLi testing in CI via sqlmap on staging environment

---

## 19.9 OWASP Top 10 Compliance

| OWASP Risk | Mitigation |
|---|---|
| A01: Broken Access Control | RBAC middleware + RLS + tenant scoping |
| A02: Cryptographic Failures | bcrypt passwords; TLS 1.3 in transit; storage-layer AES-256 encryption at rest for all data (incl. PII); AES-256-GCM application-level encryption for OAuth tokens only |
| A03: Injection | Prisma ORM (parameterized), Zod input validation |
| A04: Insecure Design | Threat modeling on each feature, RBAC by design |
| A05: Security Misconfiguration | Helmet.js, no debug endpoints in prod, secrets via env |
| A06: Vulnerable Components | Dependabot, npm audit in CI, monthly dep updates |
| A07: Identity and Auth Failures | JWT rotation, bcrypt, rate limiting, account lockout |
| A08: Software Data Integrity | Signed packages, dependency pinning, SBOM tracking |
| A09: Security Logging | All auth events logged, audit logs immutable |
| A10: SSRF | No user-controlled URLs in server-side fetches; allowlist for file upload URLs |

---

## 19.10 Security Practices & Processes

### Secret Management
- All secrets stored in environment variables (never in code)
- Production secrets in: AWS Secrets Manager (not .env files)
- Secrets rotated quarterly (JWT secrets, API keys)
- Different credentials per environment (dev/staging/prod)

### Dependency Security
- Dependabot enabled on GitHub (auto-PRs for dep updates)
- `npm audit` run in CI — high severity fails the build
- `npm audit fix` run monthly
- SBOM (Software Bill of Materials) generated in CI

### Code Security
- ESLint security plugin enabled
- `no-eval`, `no-new-func` rules enforced
- Secrets scanning via GitHub's secret scanning feature
- Pre-commit hooks: lint + test + security scan

### Penetration Testing
- Annual penetration test by third-party (before fundraising rounds)
- OWASP ZAP automated scan run on every staging deployment
- Bug bounty program (future — once > $1M ARR)

### Incident Response
1. Detect: Sentry alert / user report
2. Triage: Is this a security incident? (< 30 min)
3. Contain: Revoke affected tokens, disable affected account/org (< 1 hour)
4. Notify: Affected users within 72 hours (GDPR requirement)
5. Remediate: Fix + deploy hotfix
6. Post-mortem: Root cause, timeline, prevention (within 7 days)
7. Report to DPA (if data breach, GDPR article 33)

### Data Privacy
- GDPR: Right to access → export all data as JSON within 30 days of request
- GDPR: Right to erasure → hard delete all PII within 30 days of request
- CCPA compliance: Do not sell personal information (Privacy Policy statement)
- Cookie consent banner: GDPR-compliant (no analytics cookies without consent)
- Privacy Policy and Terms of Service reviewed by legal annually
