# PinkPath Deployment Guide

This guide walks you through deploying PinkPath to production using **Netlify** (frontend) and **Render** (backend + database).

## Prerequisites

Before starting, ensure you have:

- [ ] GitHub account with this repository pushed
- [ ] Google Cloud account with APIs enabled
- [ ] DataSF API token

---

## Part 1: Deploy Backend to Render

### Step 1.1: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub (recommended for auto-deploy)

### Step 1.2: Create New Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository (PinkPath)
3. Configure the service:

| Setting | Value |
|---------|-------|
| Name | `pinkpath-backend` |
| Region | Oregon (US West) |
| Branch | `main` |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm ci --omit=dev` |
| Start Command | `node src/server.js` |
| Plan | Free |

4. Click **"Create Web Service"**

### Step 1.3: Create PostgreSQL Database

1. Click **"New +"** → **"PostgreSQL"**
2. Configure:

| Setting | Value |
|---------|-------|
| Name | `pinkpath-db` |
| Region | Oregon (same as backend) |
| Plan | Free |

3. Click **"Create Database"**
4. Copy the **"Internal Database URL"** (starts with `postgres://`)

### Step 1.4: Set Environment Variables

Go to your web service → **"Environment"** tab → **"Add Environment Variable"**

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
| `DATABASE_URL` | Paste the Internal Database URL from Step 1.3 |

Click **"Save Changes"** - Render will auto-redeploy.

### Step 1.5: Verify Backend

Once deployed, your URL will be: `https://pinkpath-backend.onrender.com`

Test it:
```bash
curl https://pinkpath-backend.onrender.com/health
```

Should return:
```json
{"status":"healthy","timestamp":"...","version":"1.0.0","environment":"production"}
```

**Note:** Free tier services spin down after 15 minutes of inactivity. First request after sleep takes ~30 seconds.

---

## Part 2: Deploy Frontend to Netlify

### Step 2.1: Update Frontend Config

Update the Render URL in your code:

**File:** `frontend/js/modules/config.js`

```javascript
const PRODUCTION_API_URL = 'https://pinkpath-backend.onrender.com'; // <-- Your actual Render URL
```

Commit and push this change.

### Step 2.2: Connect to Netlify

Since you already have Netlify set up:

1. Go to your Netlify dashboard
2. Click **"Add new site"** → **"Import an existing project"**
3. Connect to GitHub → Select PinkPath repository

### Step 2.3: Configure Build Settings

| Setting | Value |
|---------|-------|
| Base directory | (leave empty) |
| Build command | (leave empty - static files) |
| Publish directory | `frontend` |

### Step 2.4: Deploy

1. Click **"Deploy site"**
2. Wait for deployment (1-2 minutes)
3. Note your Netlify URL (e.g., `random-name-123.netlify.app`)

### Step 2.5: Update Render CORS

Go back to Render and update the `FRONTEND_URL` environment variable:
- Set it to your Netlify URL (e.g., `https://pinkpath.netlify.app`)
- Render will auto-redeploy

---

## Part 3: Update Google OAuth

### Step 3.1: Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   - `https://pinkpath-backend.onrender.com/api/auth/google/callback`
4. Save

---

## Part 4: Verify Full Deployment

### Test Checklist

- [ ] **Health Check:** Visit `https://YOUR-RENDER-URL.onrender.com/health`
- [ ] **Frontend Loads:** Visit your Netlify URL
- [ ] **Map Displays:** Google Maps should load
- [ ] **Route Calculation:** Try calculating a route
- [ ] **Google Sign-In:** Test OAuth login flow

### Common Issues

| Issue | Solution |
|-------|----------|
| CORS errors in console | Check `FRONTEND_URL` in Render matches your Netlify URL exactly |
| "Service unavailable" | Free tier is waking up - wait 30 seconds and retry |
| Map doesn't load | Verify `GOOGLE_MAPS_API_KEY` is set correctly |
| OAuth fails | Check redirect URI in Google Console matches Render URL |
| 500 errors | Check Render logs in dashboard |

---

## Part 5: Custom Domain (Optional)

### Netlify Custom Domain

1. In Netlify: **Site settings** → **Domain management** → **Add custom domain**
2. Add your domain (e.g., `www.pinkpath.com`)
3. Follow DNS instructions

### Render Custom Domain

1. In Render: **Settings** → **Custom Domains** → **Add Custom Domain**
2. Add your API domain (e.g., `api.pinkpath.com`)
3. Update DNS CNAME record
4. Update `FRONTEND_URL` if your main domain changed
5. Update Google OAuth redirect URIs

---

## Quick Reference

### URLs After Deployment

| Service | URL |
|---------|-----|
| Frontend (Netlify) | `https://YOUR-APP.netlify.app` |
| Backend (Render) | `https://pinkpath-backend.onrender.com` |
| Health Check | `https://pinkpath-backend.onrender.com/health` |
| API Info | `https://pinkpath-backend.onrender.com/api` |

### Free Tier Limitations

| Service | Limitation |
|---------|------------|
| **Render Web Service** | Spins down after 15 min inactivity (30s cold start) |
| **Render PostgreSQL** | Free for 90 days, then must recreate or upgrade |
| **Netlify** | 100GB bandwidth/month |

### Costs If You Upgrade

| Service | Free | Paid |
|---------|------|------|
| Render Web Service | $0 (with cold starts) | $7/month (always on) |
| Render PostgreSQL | $0 (90 days) | $7/month |
| Netlify | $0 | $19/month |

---

## Monitoring & Logs

### Render Logs

1. Go to Render dashboard
2. Click on your service
3. Click **"Logs"** tab

### Netlify Logs

1. Go to Netlify dashboard
2. Click **"Deploys"**
3. Click on a deploy to see logs

---

## Rollback

### Render
1. Go to your service → **"Events"** tab
2. Find previous successful deploy
3. Click **"Rollback to this deploy"**

### Netlify
1. Go to **"Deploys"**
2. Find previous successful deploy
3. Click **"Publish deploy"**
