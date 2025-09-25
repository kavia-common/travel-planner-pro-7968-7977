//
// Optional Google Places and Directions helpers (simulation-first).
// Uses environment variables:
// - REACT_APP_GOOGLE_MAPS_API_KEY
// - REACT_APP_GOOGLE_USE_SIMULATION (default "1")
//
/** PUBLIC_INTERFACE
 * Fetch place details (name, address, rating, user_ratings_total, location) by a free-text query.
 * If simulation mode is on or API key absent, returns a minimal simulated response.
 */
export async function getGooglePlaceDetailsByText(query) {
  const sim = process.env.REACT_APP_GOOGLE_USE_SIMULATION !== "0";
  const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (sim || !key) {
    return {
      ok: true,
      place: {
        name: query,
        formatted_address: "",
        rating: null,
        user_ratings_total: null,
        location: null,
      },
      simulated: true,
    };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query
    )}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const first = data?.results?.[0];
    if (!first) return { ok: false, error: "No results" };
    return {
      ok: true,
      place: {
        name: first.name,
        formatted_address: first.formatted_address,
        rating: first.rating ?? null,
        user_ratings_total: first.user_ratings_total ?? null,
        location:
          first.geometry?.location?.lat && first.geometry?.location?.lng
            ? { lat: first.geometry.location.lat, lon: first.geometry.location.lng }
            : null,
      },
      simulated: false,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** PUBLIC_INTERFACE
 * Get directions summary (distance, duration) between ordered points using Google Directions.
 * Returns { ok, route: { distance, duration }, simulated } or { ok:false, error }.
 * Falls back to simulation when key missing or env forces simulation.
 */
export async function getGoogleDirectionsSummary(points, mode) {
  const sim = process.env.REACT_APP_GOOGLE_USE_SIMULATION !== "0";
  const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (sim || !key || !Array.isArray(points) || points.length < 2) {
    return {
      ok: true,
      simulated: true,
      route: {
        distance: null,
        duration: null,
      },
    };
  }

  try {
    // Build Directions API URL: origin, destination, waypoints
    const origin = `${points[0].lat},${points[0].lon}`;
    const destination = `${points[points.length - 1].lat},${points[points.length - 1].lon}`;
    const wps =
      points.length > 2
        ? `&waypoints=${encodeURIComponent(
            points.slice(1, -1).map((p) => `${p.lat},${p.lon}`).join("|")
          )}`
        : "";
    const travelMode =
      mode === "car" ? "driving" : mode === "bike" ? "bicycling" : "walking";
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
      origin
    )}&destination=${encodeURIComponent(destination)}${wps}&mode=${travelMode}&key=${encodeURIComponent(
      key
    )}`;

    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return { ok: false, error: "No route" };

    // Sum legs
    const legs = route.legs || [];
    const distance = legs.reduce((sum, l) => sum + (l.distance?.value || 0), 0);
    const duration = legs.reduce((sum, l) => sum + (l.duration?.value || 0), 0);

    return { ok: true, simulated: false, route: { distance, duration } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** PUBLIC_INTERFACE
 * Provide a simple safety tip heuristic for walking/cycling/driving.
 */
export function travelSafetyTip(mode) {
  if (mode === "car") {
    return "Drive defensively and follow local speed limits. Prefer well-lit roads at night.";
  }
  if (mode === "bike") {
    return "Wear a helmet and use dedicated bike lanes where available. Be visible at night.";
  }
  return "Stick to well-lit streets and sidewalks. Avoid isolated routes after dark.";
}
