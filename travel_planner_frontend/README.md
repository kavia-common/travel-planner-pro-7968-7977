# Travel Planner Frontend (React)

A modern, Ocean Professional themed travel planner that provides:
- Authentication (Login/Signup) with localStorage-backed user data (simulating a JSON file)
- Navigation bar
- Split view: itinerary and attractions on the left; interactive OpenStreetMap on the right
- Discover attractions via Overpass API (free)
- Build/edit itinerary; click map to add custom waypoints
- Route planning via OSRM public demo server for walking/cycling/driving
- Modals for details and add-to-itinerary

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

## APIs used (free/open-source)

- Map tiles: OpenStreetMap standard tiles
- POIs/Attractions: Overpass API (https://overpass-api.de/)
- Routing: OSRM public demo server (https://router.project-osrm.org)

Notes:
- Public demo servers are rate-limited and for light usage/testing. For heavy usage, self-host Overpass/OSRM or use another free-tier service.
- No API keys or environment variables are required.

## Usage

- Use "Discover nearby" or Search to load attractions near the current map center.
- Click on the map to add a custom point to your itinerary.
- Change the travel mode (Walking/Cycling/Driving) to recalculate the route.
- Open details to see OSM tags and add to itinerary via modal.

## Styling

The interface follows the Ocean Professional theme with blue and amber accents and a modern, minimalist style. Styles are defined in src/index.css.

