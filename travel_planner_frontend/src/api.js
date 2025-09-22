/**
 * Overpass API and OSRM helpers (public/free services).
 * Note: OSRM demo server is for demo/testing; heavy or production use should self-host.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OSRM_BASE = "https://router.project-osrm.org";

/**
 * Build Overpass QL query for POIs around a coordinate within radius.
 */
function buildOverpassQuery(lat, lon, radius = 1200, categories = ["tourism", "amenity"]) {
  const filters = categories
    .map((k) => `node(around:${radius},${lat},${lon})[${k}];way(around:${radius},${lat},${lon})[${k}];relation(around:${radius},${lat},${lon})[${k}];`)
    .join("\n");
  return `
    [out:json][timeout:25];
    (
      ${filters}
    );
    out center 50;
  `;
}

// PUBLIC_INTERFACE
export async function fetchAttractionsAround(lat, lon, radius = 1200) {
  /** Fetch attractions/POIs around the given coordinate using Overpass API. */
  const query = buildOverpassQuery(lat, lon, radius);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString()
  });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = await res.json();
  // Normalize elements to { id, name, lat, lon, tags }
  const items = (data.elements || []).map((el) => {
    const center = el.type === "node" ? { lat: el.lat, lon: el.lon } : el.center || {};
    return {
      id: `${el.type}/${el.id}`,
      name: el.tags?.name || el.tags?.["name:en"] || Object.values(el.tags || {})[0] || "Unknown",
      lat: center.lat,
      lon: center.lon,
      tags: el.tags || {},
      type: el.type
    };
  }).filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lon));
  return items;
}

// PUBLIC_INTERFACE
export async function routeBetween(points, profile = "foot") {
  /**
   * Request a route line between given points using OSRM public server.
   * points: [{lat, lon}, ...]
   * profile: "foot" | "bike" | "car" => maps to "foot", "bike" (bicycle), "driving"
   */
  const mapped = profile === "car" ? "driving" : (profile === "bike" ? "bike" : "foot");
  const profilePath = mapped === "bike" ? "bicycle" : mapped; // OSRM naming
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const url = `${OSRM_BASE}/route/v1/${profilePath}/${coords}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM error: ${res.status}`);
  const data = await res.json();
  if (!data.routes || !data.routes[0]) return null;
  const route = data.routes[0];
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry
  };
}
