# PinkPath Deployment Guide

This guide walks you through deploying PinkPath to production using **Netlify** (frontend) and **Railway** (backend + database).

## Prerequisites

Before starting, ensure you have:

- [ ] GitHub account with this repository pushed
- [ ] Google Cloud account with APIs enabled
- [ ] DataSF API token

---

## Part 1: Deploy Backend to Railway

### Step 1.1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (recommended for auto-deploy)

### Step 1.2: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Find and select your PinkPath repository
4. Railway will detect the `railway.toml` configuration

### Step 1.3: Add PostgreSQL Database

1. In your Railway project, click **"New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway automatically creates `DATABASE_URL` environment variable

### Step 1.4: Set Environment Variables

In Railway dashboard, go to your service → **"Variables"** tab.

Add these variables:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://YOUR-APP.netlify.app` (update after Netlify deploy) |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SESSION_SECRET` | Generate another unique string |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_MAPS_API_KEY` | From Google Cloud Console |
| `DATASF_APP_TOKEN` | From DataSF |

### Step 1.5: Deploy

1. Railway auto-deploys when you push to GitHub
2. Or click **"Deploy"** manually
3. Wait for build to complete (2-3 minutes)
4. Click on the deployment to see the URL (e.g., `pinkpath-backend-production.up.railway.app`)

### Step 1.6: Verify Backend

Test your backend is running:

```bash
curl https://YOUR-RAILWAY-URL.up.railway.app/health
```

Should return:
```json
{"status":"healthy","timestamp":"...","version":"1.0.0","environment":"production"}
```

---

## Part 2: Deploy Frontend to Netlify

### Step 2.1: Update Frontend Config

Before deploying, update the Railway URL in your code:

**File:** `frontend/js/modules/config.js`

```javascript
const PRODUCTION_API_URL = 'https://YOUR-RAILWAY-URL.up.railway.app'; // <-- Put your Railway URL here
```

Commit and push this change.

### Step 2.2: Create Netlify Account

1. Go to [netlify.com](https://www.netlify.com)
2. Sign up with GitHub (recommended)

### Step 2.3: Create New Site

1. Click **"Add new site"** → **"Import an existing project"**
2. Connect to GitHub
3. Select your PinkPath repository

### Step 2.4: Configure Build Settings

Netlify should auto-detect settings from `netlify.toml`, but verify:

| Setting | Value |
|---------|-------|
| Base directory | (leave empty) |
| Build command | (leave empty) |
| Publish directory | `frontend` |

### Step 2.5: Deploy

1. Click **"Deploy site"**
2. Wait for deployment (1-2 minutes)
3. Note your Netlify URL (e.g., `random-name-123.netlify.app`)

### Step 2.6: Update Railway CORS

Now that you have your Netlify URL, go back to Railway:

1. Open Railway dashboard
2. Go to Variables
3. Update `FRONTEND_URL` to your Netlify URL (e.g., `https://pinkpath.netlify.app`)
4. Railway will auto-redeploy

---

## Part 3: Update Google OAuth

Your Google OAuth callback URL needs to point to Railway.

### Step 3.1: Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   - `https://YOUR-RAILWAY-URL.up.railway.app/api/auth/google/callback`
4. Save

---

## Part 4: Verify Full Deployment

### Test Checklist

- [ ] **Health Check:** Visit `https://YOUR-RAILWAY-URL.up.railway.app/health`
- [ ] **Frontend Loads:** Visit your Netlify URL
- [ ] **Map Displays:** Google Maps should load
- [ ] **Route Calculation:** Try calculating a route
- [ ] **Google Sign-In:** Test OAuth login flow

### Common Issues

| Issue | Solution |
|-------|----------|
| CORS errors in console | Check `FRONTEND_URL` in Railway matches your Netlify URL exactly |
| Map doesn't load | Verify `GOOGLE_MAPS_API_KEY` is set and has correct API restrictions |
| OAuth fails | Check redirect URI in Google Console matches Railway URL |
| 500 errors | Check Railway logs for details (`railway logs`) |

---

## Part 5: Custom Domain (Optional)

### Netlify Custom Domain

1. In Netlify: **Site settings** → **Domain management** → **Add custom domain**
2. Add your domain (e.g., `www.pinkpath.com`)
3. Follow DNS instructions to point your domain to Netlify

### Railway Custom Domain

1. In Railway: **Settings** → **Domains** → **Add Domain**
2. Add your API domain (e.g., `api.pinkpath.com`)
3. Update DNS CNAME record
4. Update `FRONTEND_URL` if your main domain changed
5. Update Google OAuth redirect URIs

### Update Frontend Config

If using custom domains, update `config.js`:

```javascript
const PRODUCTION_API_URL = 'https://api.pinkpath.com';
```

---

## Quick Reference

### URLs After Deployment

| Service | URL |
|---------|-----|
| Frontend (Netlify) | `https://YOUR-APP.netlify.app` |
| Backend (Railway) | `https://YOUR-APP.up.railway.app` |
| Health Check | `https://YOUR-APP.up.railway.app/health` |
| API Info | `https://YOUR-APP.up.railway.app/api` |

### Environment Variables Summary

**Railway (Backend):**
- `NODE_ENV` = production
- `FRONTEND_URL` = Netlify URL
- `JWT_SECRET` = random 64-char hex
- `SESSION_SECRET` = random 64-char hex
- `GOOGLE_CLIENT_ID` = from Google
- `GOOGLE_CLIENT_SECRET` = from Google
- `GOOGLE_MAPS_API_KEY` = from Google
- `DATASF_APP_TOKEN` = from DataSF
- `DATABASE_URL` = auto-set by Railway

**Netlify (Frontend):**
- No environment variables needed (config is in code)

---

## Monitoring & Logs

### Railway Logs

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# View logs
railway logs
```

Or view in Railway dashboard → Deployments → Click deployment → Logs

### Netlify Logs

View in Netlify dashboard → Deploys → Click deploy → Deploy log

---

## Rollback

### Railway
1. Go to Deployments
2. Find previous successful deployment
3. Click **"Redeploy"**

### Netlify
1. Go to Deploys
2. Find previous successful deploy
3. Click **"Publish deploy"**
