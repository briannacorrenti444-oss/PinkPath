# PinkPath - Production Deployment Todo

## Priority 1: Production Deployment

### Frontend (Netlify)
- [ ] Migrate frontend to Netlify for production hosting
- [ ] Configure Netlify environment variables
- [ ] Set up custom domain (if applicable)
- [ ] Configure Netlify redirects for SPA routing

### Backend Hosting
- [ ] Choose backend hosting provider (Railway, Render, Fly.io, or similar)
- [ ] Deploy backend API to production
- [ ] Set up production PostgreSQL database (Supabase, Neon, or provider's managed DB)
- [ ] Configure production environment variables

### Docker
- [ ] Keep Docker setup for local development/testing
- [ ] Document Docker usage in README for contributors

## Priority 3: API Key Security

### Google Cloud Console
- [ ] Create separate API keys for production vs development
- [ ] Restrict production frontend key:
  - [ ] Maps JavaScript API
  - [ ] Places API (New)
  - [ ] Geocoding API
  - [ ] HTTP referrer restriction: `yourdomain.com/*`
- [ ] Restrict production backend key:
  - [ ] Routes API
  - [ ] Geocoding API
  - [ ] IP restriction (backend server IP)
- [ ] Set usage quotas/alerts to prevent unexpected billing

### Environment Variables
- [ ] Never commit API keys to git
- [ ] Use `.env` files locally (already in .gitignore)
- [ ] Configure secrets in hosting provider dashboards

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
- Google Routes API was just enabled - test before proceeding with deployment
- Backend API key is currently unrestricted - must restrict before production

## Notes To Bri from Cam

 - Test and verify backend functionality then do a security audit (I can help with the audit part)
    - API stuff should all be working, you can ask claude to verify the endpoints and make sure the data it's getting is the right data
    - User DB data is not verified AT ALL. A first pass should be written in, the main thing would be to verify you can make an account and login. You will likely need to implement the account setup steps. Then look at the other DB data as I outlined in Cam's Notes on the technical Doc.

 - Redo the algorithm to include a linear regression ML algorithm (more robust, requires user feedback data or whatever "the right answer"   is to determine safety score)

 - Fix Google API key restrictions (for deployment not needed for testing)
 
 - Fix mobile webpage buttons (currently works on laptop/PC browsers but not on Apple Browser)
 
 - Make it deployable as an app in iOS (and android?) (This is a whole process for Apple and set out some time to do it when you think you're ready to deploy to users)
 
 - Make sure all API's are working and getting the data you need (the less API calls, the faster everything will run)
 
 - Verify Production vs. Testing deployment infrastructure
    - Testing would be with Docker on your PC and with devices on the same network as this
    - Production would be with Netlify and available to your users
    - Verify DB hosting infrastructure relative to testing vs production (Have all production DB data available in testing, but not all testing DB data in production)
 
 - Remove all redundant code (might want to make this part of the claude system prompt)
