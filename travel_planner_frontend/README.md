# Travel Planner Frontend (React)

A modern, Ocean Professional themed travel planner that provides:
- Navigation bar
- Split view: itinerary and attractions on the left; interactive OpenStreetMap on the right
- Discover attractions via Overpass API (free)
- Build/edit itinerary; click map to add custom waypoints
- Route planning via OSRM public demo server for walking/cycling/driving
- Modals for details and add-to-itinerary
- No authentication required

## Run

- npm install
- npm start

App runs at http://localhost:3000

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

