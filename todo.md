# PinkPath - Production Deployment Todo

## Priority 1: Production Deployment

### Frontend (Netlify)
- [x] Migrate frontend to Netlify for production hosting
- [ ] Configure Netlify environment variables
- [ ] Set up custom domain (if applicable)
- [x] Configure Netlify redirects for SPA routing

### Backend Hosting (Render)
- [x] Choose backend hosting provider: **Render**
- [ ] Deploy backend API to production
- [ ] Set up production PostgreSQL database (Supabase, Neon, or provider's managed DB)
- [ ] Configure production environment variables
- [ ] Set Render to paid plan (>90 days) as needed

### Render Web Service Setup (Deferred)
- [ ] Fix Render deployment for production (after local Docker testing complete)
  - [ ] Decide: Native Node vs Docker on Render
  - [ ] If Native Node: Rename `backend/Dockerfile` → `backend/Dockerfile.local`
  - [ ] If Native Node: Solve `shared/` package import (copy to backend or use relative path)
  - [ ] Create `render.yaml` production config separate from local Docker
  - [ ] Test health endpoint: `/health`
  - [ ] Test one full route calculation end-to-end
  - [ ] Set up UptimeRobot or similar for monitoring

### ML Algorithm
- [ ] Implement linear regression ML algorithm for safety scoring
- [ ] Requires user feedback data to determine "correct" safety scores
- [ ] Design feedback collection mechanism

**Note:** Multiple route finding has started - currently showing 8 route options. Need to:
- Make generated route variations follow actual street paths (not just coordinate offsets)
- Verify street lighting scores are calculated per-route (currently all routes return +/- 1 of same score)
- Ensure crime data, foot traffic, and other safety factors are unique per route path

### Docker
- [ ] Keep Docker setup for local development/testing
- [ ] Document Docker usage in README for contributors

## Priority 3: API Key Security

### Google Cloud Console
- [x] Create separate API keys for production vs development
- [x] Restrict production frontend key:
  - [x] Maps JavaScript API
  - [x] Places API (New)
  - [x] Geocoding API
  - [x] HTTP referrer restriction: `yourdomain.com/*`
- [x] Restrict production backend key:
  - [x] Routes API
  - [x] Geocoding API
  - [x] IP restriction (backend server IP)
- [x] Set usage quotas/alerts to prevent unexpected billing

### Environment Variables
- [x] Never commit API keys to git
- [x] Use `.env` files locally (already in .gitignore)
- [ ] Configure secrets in hosting provider dashboards

## Priority 2: Google Sign-In

### Backend (Complete)
- [x] Backend OAuth endpoints implemented (`/api/auth/google`, `/api/auth/google/callback`)
- [x] State token validation for CSRF protection
- [x] User creation/linking with Google accounts
- [x] JWT token generation on successful OAuth

### Frontend (Complete)
- [x] Add "Sign in with Google" button to auth screen (official Google branding)
- [x] Create callback handler for OAuth redirect
  - [x] Extract token from URL `?token=xxx`
  - [x] Store in localStorage
  - [x] Redirect to home screen
  - [x] Handle error cases `?error=xxx`
- [x] Style Google button per Google brand guidelines
- [x] Streamlined auth UI (removed username field, modern inputs)
- [x] Loading states on auth buttons

### Google Cloud Console Setup (Local Development)
- [ ] Create OAuth 2.0 credentials in Google Cloud Console
  - Go to: https://console.cloud.google.com/apis/credentials
  - Click "+ CREATE CREDENTIALS" → "OAuth client ID"
  - Application type: "Web application"
  - Name: "PinkPath Web Client"
- [ ] Add local redirect URI:
  - `http://localhost:3001/api/auth/google/callback`
- [ ] Add to `.env` file:
  - `GOOGLE_CLIENT_ID=your-client-id`
  - `GOOGLE_CLIENT_SECRET=your-client-secret`
- [ ] Restart Docker after adding credentials

### Google Cloud Console Setup (Beta Production)
- [ ] Add production redirect URI in OAuth client settings:
  - `https://pinkpath-backend.onrender.com/api/auth/google/callback`
- [ ] Add JavaScript origins (optional):
  - `https://pinkpath.netlify.app`
- [ ] Fix backend callback URL config for production (currently hardcoded to localhost)
- [ ] Set env vars on Render:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `FRONTEND_URL=https://pinkpath.netlify.app`

### OAuth Consent Screen (Google Cloud Console)
- [ ] Configure consent screen (APIs & Services → OAuth consent screen)
  - App name: PinkPath
  - Support email: your email
  - App logo: optional
- [ ] For Private Beta (<100 users): Stay in "Testing" mode
  - Add beta tester Gmail addresses to "Test users" list
  - Only test users can sign in
- [ ] For Public Beta (>100 users): Click "PUBLISH APP"
  - Anyone can sign in
  - May require Google verification for sensitive scopes

## Priority 3: Trip Sharing & Auto-Notifications

### Overview
Automatically notify emergency contacts when user starts a trip, arrives safely, or triggers SOS.
- **SMS Provider:** Twilio (US numbers only)
- **Cost:** ~$0.008/SMS, ~$0.024/trip (3 messages)
- **Subscription Model:** TBD (free tier limits vs premium unlimited)

### Twilio Setup Instructions
1. Create Twilio account: https://www.twilio.com/try-twilio
2. Verify your phone number
3. Get a Twilio phone number ($1/month):
   - Console → Phone Numbers → Buy a Number
   - Select US number with SMS capability
4. Find your credentials:
   - Console → Account Info → Account SID
   - Console → Account Info → Auth Token
5. Add to `.env`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
   ```
6. For production on Render, add same env vars in dashboard

### Phase 1: Database Foundation
- [ ] Create `trips` table:
  - `id`, `user_id`, `route_history_id`
  - `status` (started, in_progress, arrived, cancelled, sos)
  - `start_lat`, `start_lng`, `end_lat`, `end_lng`
  - `destination_name`, `origin_name`
  - `estimated_arrival`, `actual_arrival`
  - `sharing_enabled`, `created_at`, `updated_at`
- [ ] Create `trip_notifications` table:
  - `id`, `trip_id`, `contact_id`
  - `notification_type` (trip_started, arrived, delayed, check_in, sos)
  - `delivery_status` (pending, sent, delivered, failed)
  - `message_content`, `sent_at`, `delivered_at`
- [ ] Add trip sharing fields to `safety_preferences`:
  - `share_trips_default` (boolean)
  - `notify_on_arrival` (boolean)
  - `notify_on_delay` (boolean)
  - `delay_threshold_minutes` (integer, default 15)
- [ ] Add `trips_shared_this_month` tracking for subscription limits (TBD)

### Phase 2: Twilio Integration (Backend)
- [ ] Create `backend/src/services/twilioService.js`:
  - Initialize Twilio client
  - `sendSMS(to, message)` function
  - Handle delivery status callbacks
  - Error handling and retry logic
- [ ] Create SMS message templates:
  ```
  TRIP_STARTED: "🚶 {userName} started walking to {destination}. ETA: {eta}.
                 For live location, ask them to share via iMessage or WhatsApp."

  ARRIVED_SAFELY: "✅ {userName} arrived safely at {destination}."

  TRIP_DELAYED: "⚠️ {userName}'s trip is taking longer than expected ({minutes} min over ETA).
                 Last known location: {location}. Consider checking in with them."

  MANUAL_CHECK_IN: "👋 {userName} checked in and says they're OK! Current area: {location}"

  TRIP_CANCELLED: "ℹ️ {userName} ended their trip early near {location}."

  SOS_EMERGENCY: "🚨 EMERGENCY: {userName} triggered an SOS alert and may need help!
                  Location: {location}
                  Time: {time}
                  Please call them immediately or contact emergency services."
  ```
- [ ] Add Twilio webhook endpoint for delivery status updates
- [ ] Add to `backend/src/config/index.js`:
  - `twilio.accountSid`, `twilio.authToken`, `twilio.phoneNumber`

### Phase 3: Trip Service (Backend)
- [ ] Create `backend/src/services/tripService.js`:
  - `createTrip(userId, routeData, sharingEnabled)`
  - `updateTripStatus(tripId, status)`
  - `getTripById(tripId)`
  - `getActiveTrip(userId)`
  - `checkTripDelay(tripId)` - compare current time vs ETA
- [ ] Create `backend/src/routes/trips.js`:
  - `POST /api/trips` - Start a new trip
  - `PATCH /api/trips/:id/status` - Update status (arrived, cancelled)
  - `GET /api/trips/:id` - Get trip details
  - `POST /api/trips/:id/check-in` - Manual "I'm OK"
  - `POST /api/trips/:id/sos` - Trigger emergency alert
  - `GET /api/trips/active` - Get user's current active trip
- [ ] Create `backend/src/services/notificationService.js`:
  - `notifyContacts(tripId, notificationType)`
  - Queue notifications for all user's contacts
  - Log all notifications to `trip_notifications` table

### Phase 4: Arrival Detection (Backend)
- [ ] Create `backend/src/services/arrivalService.js`:
  - `checkArrival(tripId, currentLat, currentLng)`
  - Calculate distance to destination
  - If within 50 meters, mark as arrived
  - Trigger arrival notification
- [ ] Add location update endpoint:
  - `POST /api/trips/:id/location` - Update current location
  - Called periodically from frontend during navigation
- [ ] Background job for delay detection:
  - Check all active trips every 5 minutes
  - If current_time > estimated_arrival + delay_threshold
  - Send delay notification (only once per trip)

### Phase 5: Frontend - Trip Sharing Toggle
- [ ] Add "Share Trip" toggle to Route Results screen:
  - Toggle switch with label "Share with emergency contacts"
  - Show contact names: "Mom, Dad will be notified"
  - Disclaimer text below toggle
- [ ] Disclaimer text:
  ```
  "Your contacts will receive a text when you start and arrive.
   For real-time location sharing, use your phone's built-in
   location sharing (iMessage, WhatsApp, or Find My)."
  ```
- [ ] Store sharing preference in trip when starting navigation
- [ ] Update `startNavigation()` to:
  - Check if sharing enabled
  - Call `POST /api/trips` to create trip record
  - Show confirmation: "Notifying your contacts..."

### Phase 6: Frontend - Navigation Screen Updates
- [ ] Add "Sharing with contacts" banner when trip is shared
- [ ] Add "I'm OK" button:
  - Sends check-in notification to all contacts
  - Shows confirmation toast
  - Cooldown: once per 10 minutes
- [ ] Add "I Arrived" button:
  - Manual arrival confirmation
  - For when auto-detection doesn't trigger
  - Sends arrival notification
- [ ] Update `endNavigation()` to:
  - If trip was shared and not marked arrived, ask "Did you arrive safely?"
  - Options: "Yes, I arrived" / "No, ended early"
  - Send appropriate notification
- [ ] Show delivery confirmations:
  - Toast: "✓ Text sent to Mom, Dad"
  - If failed: "⚠️ Failed to notify [contact]. Tap to retry."

### Phase 7: Frontend - Account Settings
- [ ] Add "Trip Sharing" section to Account Settings:
  - Toggle: "Share trips by default"
  - Setting: "Alert contacts if trip delayed by ___ minutes" (slider: 10-30)
  - Toggle: "Send arrival notifications"
- [ ] Add trip sharing stats (if subscription limits implemented):
  - "Shared trips this month: 3 of 5"
  - "Resets on [date]"
- [ ] Per-contact notification preferences (future):
  - Which contacts to notify for regular trips vs SOS only

### Phase 8: SOS Integration
- [ ] Update existing SOS button to use trip sharing system:
  - If trip active: Send SOS notification with trip context
  - If no trip: Send SOS with current location only
- [ ] SOS should always send regardless of subscription limits
- [ ] Include in SOS message:
  - User's name
  - Current location (address if possible, coords as fallback)
  - Time of alert
  - Any active trip destination

### Phase 9: Testing & Polish
- [ ] Test SMS delivery to real phone numbers
- [ ] Test all notification types
- [ ] Test arrival detection accuracy (50m geofence)
- [ ] Test delay detection timing
- [ ] Handle edge cases:
  - User loses internet during trip
  - User's phone dies (no arrival notification)
  - Contact has invalid phone number
  - Twilio service outage
- [ ] Add rate limiting to prevent SMS abuse
- [ ] Add logging for all SMS sends (for debugging and billing)

### Subscription Model (Decision Needed)
**Options to decide:**
- [ ] **Option A:** App absorbs all SMS costs (simplest)
- [ ] **Option B:** Free tier: 5 shared trips/month, Premium: unlimited
- [ ] **Option C:** All users get limited trips, pay per additional
- [ ] Decide before Phase 7 implementation

### Cost Estimates
| Usage Level | Monthly SMS Cost |
|-------------|------------------|
| 1,000 users, 30% share, 5 trips each | ~$36 |
| 10,000 users, 30% share, 5 trips each | ~$360 |
| 10,000 users, 50% share, 10 trips each | ~$1,200 |

### Files to Create/Modify
| File | Action |
|------|--------|
| `backend/src/db/connection.js` | Add trips, trip_notifications tables |
| `backend/src/services/twilioService.js` | New - SMS sending |
| `backend/src/services/tripService.js` | New - trip management |
| `backend/src/services/notificationService.js` | New - notification logic |
| `backend/src/services/arrivalService.js` | New - geofence detection |
| `backend/src/routes/trips.js` | New - trip API endpoints |
| `backend/src/config/index.js` | Add Twilio config |
| `frontend/index.html` | Add share toggle, I'm OK button, settings |
| `frontend/js/script.js` | Trip sharing logic |
| `frontend/js/modules/controllers/tripController.js` | New - trip state management |
| `frontend/styles.css` | New component styles |
| `.env` | Add Twilio credentials |
| `.env.example` | Document Twilio env vars |

## Priority 4: Missing Features / Improvements

### UI/Branding
- [ ] Add favicon (pink shield icon) to eliminate 404 console error

### Error Handling
- [ ] Add user-friendly error messages when Routes API fails
- [ ] Add fallback behavior when crime data API is unavailable
- [ ] Add loading states and error boundaries in UI

### Testing
- [ ] Verify Google Places autocomplete works in production
- [ ] Test route calculation with various SF addresses
- [ ] Test mobile responsiveness
- [ ] Cross-browser testing (Chrome, Safari, Firefox)

### Performance
- [ ] Enable gzip compression on backend responses
- [ ] Add caching headers for static assets
- [ ] Consider CDN for frontend assets

### Security
- [ ] Add rate limiting to backend API
- [ ] Add CORS restrictions for production domain only
- [ ] Review Content Security Policy headers
- [ ] HTTPS enforcement (automatic on Netlify)

## Notes

- Current Docker setup works for local testing on `localhost:3000` (frontend) and `localhost:3001` (backend)
- Google Routes API was just enabled - test before proceeding with deployment (done)
- Backend API key is currently unrestricted - must restrict before production (done)

## Notes To Bri from Cam

 - Do a security audit (I can help with the audit part)
    - (DONE!) API stuff should all be working, you can ask claude to verify the endpoints and make sure the data it's getting is the right data
    - (DONE!) User DB data is not verified AT ALL. A first pass should be written in, the main thing would be to verify you can make an account and login. You will likely need to implement the account setup steps. Then look at the other DB data as I outlined in Cam's Notes on the technical Doc.

 - (MOVED TO PRIORITY 1) Redo the algorithm to include a linear regression ML algorithm

 - (DONE!) Fix Google API key restrictions (for deployment not needed for testing)
 
 - (DONE!) Fix mobile webpage buttons (currently works on laptop/PC browsers but not on Apple Browser)
 
 - Make it deployable as an app in iOS (and android?) (This is a whole process for Apple and set out some time to do it when you think you're ready to deploy to users)
 
 - (DONE!) Make sure all API's are working and getting the data you need (the less API calls, the faster everything will run)
 
 - Verify Production vs. Testing deployment infrastructure
    - Testing would be with Docker on your PC and with devices on the same network as this
    - Production would be with Netlify and available to your users
    - Verify DB hosting infrastructure relative to testing vs production (Have all production DB data available in testing, but not all testing DB data in production)
    - Remove console messages
 
 - (DONE!) Remove all redundant code (might want to make this part of the claude system prompt)


