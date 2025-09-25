/**
 * Overpass API and OSRM helpers (public/free services).
 * Note: OSRM demo server is for demo/testing; heavy or production use should self-host.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OSRM_BASE = "https://router.project-osrm.org";

/**
 * Build Overpass QL query for POIs around a coordinate within radius.
 * categories can be a list of tag keys or full key=value filters.
 */
function buildOverpassQuery(lat, lon, radius = 1200, categories = ["tourism", "amenity"]) {
  const toFilter = (entry) => {
    // Support key or key=value
    if (entry.includes("=")) {
      const [k, v] = entry.split("=");
      return `[${k}=${JSON.stringify(v)}]`;
    }
    return `[${entry}]`;
  };

  const filters = categories
    .map((raw) => {
      const flt = toFilter(raw);
      return `node(around:${radius},${lat},${lon})${flt};way(around:${radius},${lat},${lon})${flt};relation(around:${radius},${lat},${lon})${flt};`;
    })
    .join("\n");

  return `
    [out:json][timeout:25];
    (
      ${filters}
    );
    out center 80;
  `;
}

// PUBLIC_INTERFACE
export async function fetchAttractionsAround(lat, lon, radius = 1200, categories) {
  /** Fetch attractions/POIs around the given coordinate using Overpass API. */
  const query = buildOverpassQuery(lat, lon, radius, categories || ["tourism", "amenity", "leisure", "historic"]);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }).toString()
  });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = await res.json();
  // Normalize elements to { id, name, lat, lon, tags }
  const items = (data.elements || [])
    .map((el) => {
      const center = el.type === "node" ? { lat: el.lat, lon: el.lon } : el.center || {};
      return {
        id: `${el.type}/${el.id}`,
        name: el.tags?.name || el.tags?.["name:en"] || Object.values(el.tags || {})[0] || "Unknown",
        lat: center.lat,
        lon: center.lon,
        tags: el.tags || {},
        type: el.type
      };
    })
    .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lon));
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

// PUBLIC_INTERFACE
export async function nominatimSearchPlaces(query, near) {
  /** Search places using OSM Nominatim; optionally bias by a nearby lat/lon. */
  if (!query || !query.trim()) return [];
  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    limit: "8",
  });
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lon)) {
    params.set("viewbox", `${near.lon-0.5},${near.lat+0.5},${near.lon+0.5},${near.lat-0.5}`);
    params.set("bounded", "1");
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { "Accept": "application/json" }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data
    .map((d) => ({
      id: `nominatim/${d.place_id}`,
      name: d.display_name?.split(",").slice(0, 2).join(", ") || d.display_name || "Place",
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      tags: { class: d.class, type: d.type, importance: d.importance, display_name: d.display_name },
      type: d.type || "place",
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

// PUBLIC_INTERFACE
export async function reverseGeocode(lat, lon) {
  /** Reverse geocode lat/lon via Nominatim to a human friendly display name. */
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=16&addressdetails=1`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}
