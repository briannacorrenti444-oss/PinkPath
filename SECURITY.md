# PinkPath Security Documentation

This document outlines the security measures implemented in PinkPath for production deployment.

## Security Audit Summary

Last audit date: January 2026

| Category | Status | Notes |
|----------|--------|-------|
| Rate Limiting | Implemented | 100 req/min default, configurable |
| CORS | Hardened | Strict origin validation in production |
| JWT Authentication | Secured | Required secrets, 1-day expiration in prod |
| OAuth | Secured | CSRF protection with state tokens |
| Cookie Security | Enabled | httpOnly, secure, sameSite flags |
| Security Headers | Enabled | Helmet middleware with CSP |
| Database | SSL Required | SSL connections in production |
| Input Validation | Implemented | Fastify schema validation |

---

## Environment Variables (Required)

These MUST be set in production. The server will not start without them:

```bash
# Authentication Secrets (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=<64-character-hex-string>
SESSION_SECRET=<64-character-hex-string>

# CORS Configuration
FRONTEND_URL=https://your-app.netlify.app

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Google APIs
GOOGLE_MAPS_API_KEY=<your-key>
GOOGLE_CLIENT_ID=<your-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-oauth-secret>

# DataSF API
DATASF_APP_TOKEN=<your-token>
```

---

## Google Maps API Key Security

The Google Maps API key is exposed in the frontend (required for the JavaScript API). Protect it by:

1. **HTTP Referrer Restrictions** (Google Cloud Console)
   - Add your production domain: `https://your-app.netlify.app/*`
   - Add localhost for development: `http://localhost:3000/*`

2. **API Restrictions**
   - Only enable: Maps JavaScript API, Places API, Geometry Library

3. **Quota Limits**
   - Set daily quotas to prevent unexpected billing
   - Set alerts at 50%, 80%, 100% usage

4. **Separate Keys**
   - Use different keys for development and production
   - Never use unrestricted keys

---

## Rate Limiting

Configured via environment variables:

```bash
RATE_LIMIT_MAX=100        # Requests per window
RATE_LIMIT_WINDOW_MS=60000  # Window size (1 minute)
```

Rate limit headers are included in responses:
- `x-ratelimit-limit`: Maximum requests allowed
- `x-ratelimit-remaining`: Requests remaining in window
- `x-ratelimit-reset`: Time until window resets

---

## CORS Configuration

### Development
Allows localhost variations:
- `http://localhost:3000`
- `http://localhost:3001`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:3001`

### Production
Only allows the configured `FRONTEND_URL`. Unknown origins are rejected.

---

## JWT Tokens

- **Expiration**: 1 day in production, 7 days in development
- **Payload**: user id, email, subscription level
- **Storage**: Client-side (localStorage)

### Token Refresh
Use `POST /api/auth/refresh` with a valid token to get a new one.

---

## OAuth Security

### State Parameter (CSRF Protection)
- Cryptographically random 64-character hex token
- Validated on callback
- Single-use (deleted after validation)
- Expires after 10 minutes

### Callback Handling
- State validation before processing
- Token returned in URL (standard OAuth flow)
- Errors redirect to frontend with error parameter

---

## Cookie Security Flags

All cookies are set with:
- `httpOnly: true` - Prevents JavaScript access (XSS protection)
- `secure: true` (production) - HTTPS only
- `sameSite: strict` - Prevents CSRF
- `maxAge: 7 days` - Automatic expiration

---

## Security Headers (Helmet)

Helmet middleware sets these headers:

| Header | Value | Purpose |
|--------|-------|---------|
| X-DNS-Prefetch-Control | off | Prevents DNS prefetching |
| X-Frame-Options | SAMEORIGIN | Clickjacking protection |
| X-Content-Type-Options | nosniff | MIME sniffing protection |
| X-XSS-Protection | 0 | Legacy XSS filter (CSP preferred) |
| Referrer-Policy | no-referrer | Privacy protection |
| Content-Security-Policy | (see below) | XSS/injection protection |

### Content Security Policy (Production)
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self';
```

---

## Database Security

### SSL Connections
- Required in production
- Uses `rejectUnauthorized: false` for managed cloud certificates (Render, Heroku)

### Connection Pooling
- Max 20 connections
- 30-second idle timeout
- 5-second connection timeout

### Query Parameterization
All queries use parameterized statements to prevent SQL injection:
```javascript
await query('SELECT * FROM users WHERE id = $1', [userId]);
```

---

## Input Validation

Fastify schema validation on all endpoints:

```javascript
fastify.post('/register', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
      },
    },
  },
}, handler);
```

---

## Password Security

- **Hashing**: bcrypt with 12 rounds
- **Minimum Length**: 8 characters
- **Storage**: Only hash stored, never plaintext

---

## Error Handling

### Development
- Full error messages and stack traces
- Validation details in responses

### Production
- Generic error messages
- No stack traces or internal details
- Errors logged server-side only

---

## Monitoring Recommendations

For production, consider adding:

1. **Error Tracking**: Sentry or similar
2. **APM**: New Relic, Datadog, or similar
3. **Log Aggregation**: Logtail, Papertrail, or similar
4. **Uptime Monitoring**: UptimeRobot, Pingdom, or similar

---

## Security Checklist for Deployment

- [ ] All environment variables set
- [ ] JWT_SECRET and SESSION_SECRET are strong (64+ chars)
- [ ] FRONTEND_URL matches your Netlify domain exactly
- [ ] Google Maps API key has HTTP referrer restrictions
- [ ] Google OAuth redirect URI updated
- [ ] Database SSL enabled (automatic on Render)
- [ ] Rate limiting configured appropriately
- [ ] Error monitoring set up
- [ ] Backups configured for database

---

## Reporting Security Issues

If you discover a security vulnerability, please report it privately rather than opening a public issue.

Contact: [Add security contact email]
