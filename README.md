# PinkPath - Safety Navigation App

A safety-first pedestrian navigation app for San Francisco that calculates walking routes and scores them based on crime data, street lighting, and foot traffic.

---

## Quick Start

### Prerequisites

- **Node.js** 18+ (includes npm)
- **PostgreSQL** 14+ (for backend database)
- **Google Maps API Key** (for routing and maps)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd "App V2"

# Install all dependencies (root, backend, frontend, shared)
npm install

# Copy environment template and add your API keys
cp .env.example .env
# Edit .env with your actual API keys (see Configuration section)
```

### Running Locally

```bash
# Start both frontend and backend
npm run dev

# Or start individually:
npm run dev:backend   # Backend at http://localhost:3001
npm run dev:frontend  # Frontend at http://localhost:3000
```

### First Test

1. Open `http://localhost:3000` in your browser
2. Click **"Plan Route"**
3. Enter **"Union Square"** as start
4. Enter **"Ferry Building"** as destination
5. Click **"Find Safest Route"**
6. Verify: Routes display with safety scores

---

## Project Structure

```
pinkpath/
├── package.json              # Root package (npm workspaces)
├── .env.example              # Environment template
├── README.md                 # This file
├── ARCHITECTURE.md           # Technical architecture details
├── CLAUDE.md                 # AI assistant guidelines
│
├── frontend/                 # @pinkpath/frontend
│   ├── package.json
│   ├── index.html            # Single-page app
│   ├── styles.css            # All styling
│   ├── privacy.html          # Privacy policy
│   ├── terms.html            # Terms of service
│   └── js/
│       ├── script.js         # Main app logic
│       └── modules/          # Services, controllers, components
│
├── backend/                  # @pinkpath/backend
│   ├── package.json
│   └── src/
│       ├── server.js         # Fastify server
│       ├── config/           # Configuration
│       ├── db/               # PostgreSQL connection + schema
│       ├── routes/           # API endpoints
│       └── services/         # Business logic
│           ├── integration/
│           │   └── pathAlgorithm.js  # Core safety algorithm
│           ├── crimeService.js       # SF crime data
│           ├── lightingService.js    # Street lighting
│           ├── sunsetService.js      # Time of day
│           ├── footTrafficService.js # Pedestrian activity
│           └── geocodingService.js   # Address conversion
│
└── shared/                   # @pinkpath/shared
    ├── weights.js            # Safety scoring weights
    └── constants.js          # Shared constants
```

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
GOOGLE_MAPS_API_KEY=your_key     # Google Cloud Console
DATABASE_URL=postgres://user:pass@localhost:5432/pinkpath
JWT_SECRET=random_secure_string

# Optional (have defaults)
PORT=3001
DATASF_APP_TOKEN=your_token      # Higher rate limits for SF data
```

### Getting API Keys

| Key | Where to Get | Required |
|-----|--------------|----------|
| GOOGLE_MAPS_API_KEY | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | Yes |
| DATASF_APP_TOKEN | [DataSF](https://data.sfgov.org/profile/edit/developer_settings) | No (has default) |

**Google Maps APIs needed:**
- Routes API
- Geocoding API
- Places API
- Maps JavaScript API

---

## Features

### Current
- **Multi-route calculation** - Get up to 8 walking route options
- **Safety scoring** - 0-100 score based on crime, lighting, foot traffic
- **Crime data integration** - Historical + real-time police dispatch
- **Time-aware scoring** - Adjusts for daylight vs nighttime
- **Turn-by-turn navigation** - GPS-tracked walking directions
- **Address autocomplete** - Smart address suggestions

### How Safety Scoring Works

```
Safety Score = Σ(weight × factor_score) × time_modifier

Factors:
├── Historical Crime (35%)   - Past 90 days crime density
├── Real-time CAD (15%)      - Current police activity
├── Street Lighting (20%)    - 311 complaints + time of day
├── Foot Traffic (15%)       - Transit proximity, place activity
└── Time of Day (15%)        - Daylight vs night modifier
```

Weights are configurable in `shared/weights.js`.

---

## API Endpoints

### Routes
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/routes/calculate` | POST | Calculate safe routes |
| `/api/routes/geocode` | POST | Address to coordinates |
| `/api/routes/reverse-geocode` | POST | Coordinates to address |
| `/api/routes/history` | GET | User's route history |

### Safety Data
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/safety/crime` | GET | Historical crime data |
| `/api/safety/crime/realtime` | GET | Real-time CAD dispatch |
| `/api/safety/lighting` | GET | Streetlight complaints |
| `/api/safety/sunset` | GET | Sunrise/sunset times |
| `/api/safety/score` | GET | Aggregate safety score |
| `/api/safety/heatmap` | GET | Crime heatmap data |

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Login |
| `/api/auth/me` | GET | Get current user |

---

## Development

### Code Style

- **ES6 modules** for imports/exports
- **JSDoc comments** on all functions
- **Descriptive variable names** (no single letters)
- **Console logging** with emoji prefixes for debugging

### Testing

```bash
# Run backend tests
cd backend && npm test

# Run frontend tests
cd frontend && npm test
```

### Adding a New Service

1. Create `backend/src/services/myService.js`
2. Export pure functions (no DOM access)
3. Import in route handlers
4. Add configuration to `backend/src/config/index.js` if needed

### Adding an API Endpoint

```javascript
// In backend/src/routes/*.js
fastify.get('/my-endpoint', {
  schema: {
    querystring: { type: 'object', properties: {...} }
  }
}, async (request, reply) => {
  // Handler logic
  return reply.send({ success: true, data: ... });
});
```

---

## Database

### Schema

PostgreSQL tables created in `backend/src/db/connection.js`:

- `users` - User accounts (bcrypt passwords)
- `contacts` - Emergency contacts
- `safety_preferences` - User safety settings
- `crime_data_cache` - Cached crime data
- `streetlight_cache` - Cached lighting data
- `transit_stops` - SFMTA transit stops
- `route_history` - Saved routes

### Setup

```bash
# Create database
createdb pinkpath

# Tables auto-create on first backend start
npm run dev:backend
```

---

## External APIs

| API | Purpose | Module |
|-----|---------|--------|
| Google Routes | Walking directions | googleRoutesService.js |
| Google Geocoding | Address conversion | geocodingService.js |
| DataSF Crime | Historical crime | crimeService.js |
| DataSF CAD | Real-time police | crimeService.js |
| DataSF 311 | Streetlight complaints | lightingService.js |
| SFMTA GTFS | Transit stops | footTrafficService.js |
| sunrise-sunset.org | Sun times | sunsetService.js |

---

## Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| Map not loading | Check GOOGLE_MAPS_API_KEY in .env |
| Routes not calculating | Verify Routes API is enabled in Google Cloud |
| Database connection failed | Check DATABASE_URL format |
| GPS not working | Must be on HTTPS or localhost |
| CORS errors | Ensure backend is running on port 3001 |

### Debug Logging

Open browser DevTools (F12) → Console. Look for:
- `[ServiceName]` prefixed logs from backend services
- Error stack traces

---

## Production Deployment

### Environment Variables

Set these in production:
- `NODE_ENV=production`
- `JWT_SECRET` (strong random string)
- `DATABASE_URL` (production database)
- All API keys

### Security Checklist

- [ ] Strong JWT_SECRET
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] Database credentials secured
- [ ] API keys restricted by domain

---

## License

Private - All rights reserved.

---

## Architecture

For detailed architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

Built with care for safer communities.
