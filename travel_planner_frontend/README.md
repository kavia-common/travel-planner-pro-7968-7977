# Travel Planner Frontend (React)

A modern, Ocean Professional themed travel planner that provides:
- Authentication (Login/Signup) with localStorage-backed user data (simulating a JSON file)
- Navigation bar
- Split view: itinerary and attractions on the left; interactive OpenStreetMap on the right
- Discover attractions via Overpass API (free), with category selection:
  - All Places (broad POIs: tourism, amenity, leisure, natural, historic, etc.)
  - Pilgrim (famous temples and places of worship)
  - Nature (trekking, waterfalls, rivers, parks, reserves)
  - Historic (castles, archaeological sites, monuments)
  - Attractions (general points of interest)
- Build/edit itinerary; click map to add custom waypoints
- Route planning via OSRM public demo server for walking/cycling/driving
- Choose starting point: current location (via Geolocation) or a custom starting place
- Manual place search (Nominatim) to add places or set custom start
- Modals for details and add-to-itinerary
- Trip Advisor panel per place: official name/address, best route/time (simulated), star rating/review count (if Google Places API key provided)

Key behavior changes:
- Only user-selected places are shown on the map as markers. Discovery results are listed in the left panel; they are only added as markers when selected.
- Routes are only shown between user-selected locations in itinerary order, with a labeled polyline.
- Visual clarity improved for selected items and actions; Ocean Professional theme applied consistently.

## Run

- npm install
- npm start

App runs at http://localhost:3000

## Authentication

- Users can sign up with name, email, and password.
- Credentials are stored locally in the browser's localStorage as a JSON array; password is stored using a simple non-cryptographic hash (for demo only).
- On login, credentials are verified against the stored users. A session object is saved to localStorage.
- The planner UI is gated behind authentication and becomes accessible after successful login.
- Logout clears the session. To remove users, clear site data in your browser devtools.

Security note: This is for demo/dev usage only. Do not use this approach in production.

## APIs and integrations

- Map tiles: OpenStreetMap standard tiles
- POIs/Attractions (default): Overpass API (https://overpass-api.de/)
- Routing (default): OSRM public demo server (https://router.project-osrm.org)
- Place search and reverse geocoding (default): Nominatim (https://nominatim.openstreetmap.org)
- Optional: Google Places API / Google Maps Directions API for high-accuracy names, ratings, review counts, and routing

Environment variables:
- REACT_APP_GOOGLE_MAPS_API_KEY: Google API key with Places API and Directions API enabled (optional)
- REACT_APP_GOOGLE_USE_SIMULATION: set "1" to simulate Google responses when no key is present (default "1")

Create a .env.local file (do not commit) to enable Google:
REACT_APP_GOOGLE_MAPS_API_KEY=YOUR_KEY
REACT_APP_GOOGLE_USE_SIMULATION=0

Notes:
- Public demo servers (Overpass/OSRM/Nominatim) are rate-limited and for light usage/testing.
- Without a Google API key, ratings and review counts will show "N/A", and routes will rely on OSRM. With a key, ratings/reviews are fetched for listed places when selected, and Directions can be used for route estimation.

## Usage

- Use "Discover nearby" selecting a category (Pilgrim, Nature, Historic, Attractions) to load places around the map center.
- The left panel shows results as a concise, scrollable list with name, description, rating/reviews (when available).
- Select a place to add it to the itinerary. Only selected places are shown on the map and considered for routing.
- Click a place to open the Trip Advisor panel with official name/address, best route/time, star rating, review count, and a simple safety tip.
- Click on the map to add a custom point to your itinerary.
- Switch starting point between Current and Custom. For Custom, set from map center or via search or from a discovered place.
- Change the travel mode (Walking/Cycling/Driving) to recalculate the route.
- Open details to see tags and add/remove to/from itinerary via modal.

## Styling

The interface follows the Ocean Professional theme with blue and amber accents and a modern, minimalist style. Styles are defined in src/index.css.

Limitations:
- Ratings and review counts require a Google API key. When no key is provided, these fields display "N/A".
- Google Directions/Places are optionally used for improved accuracy; otherwise, OSRM/Overpass/Nominatim are used.
- Demo/public services may throttle or rate-limit requests.
