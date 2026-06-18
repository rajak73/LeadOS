# DNS / WAF (Cloudflare)

Same-site domains are MANDATORY for the auth refresh cookie (P0-4 / FINAL_ARCHITECTURE §3.1):

| Host | Target | Notes |
|---|---|---|
| `app.leados.app` | Vercel (apps/web) | CNAME via Cloudflare; proxied |
| `api.leados.app` | Railway/ECS (apps/api) | CNAME via Cloudflare; proxied; WAF + rate-limit rules |

Both share the registrable domain `leados.app`, so requests between them are same-site and
`SameSite=Strict` cookies are sent. Do NOT expose the API on a different registrable domain
(e.g. `*.up.railway.app`) in production.

TLS is terminated at Cloudflare; HSTS preload is set by the API (`helmet`).
