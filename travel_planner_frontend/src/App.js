import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { theme } from "./theme";
import { fetchAttractionsAround, routeBetween } from "./api";

// Fix default icon assets for Leaflet in CRA
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Utility components

function Modal({ title, open, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          {footer || <button className="btn" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div className="panel">
      <div className="section">
        <h4 className="panel-title">{title}</h4>
        {right}
      </div>
      {children}
    </div>
  );
}

function useLocalState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

/**
 * Capture click events to add waypoints.
 */
function ClickCapture({ onClick }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng);
    }
  });
  return null;
}

/**
 * Keep external center/zoom in sync when user pans/zooms map.
 */
function MapSync({ onCenterZoomChange }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      onCenterZoomChange?.({ lat: c.lat, lon: c.lng, zoom: z });
    };
    map.on("moveend", handler);
    map.on("zoomend", handler);
    return () => {
      map.off("moveend", handler);
      map.off("zoomend", handler);
    };
  }, [map, onCenterZoomChange]);
  return null;
}

/**
 * Sync external center/zoom state TO the Leaflet map, with smooth animation.
 * This complements MapSync (which syncs FROM the map to state).
 */
function MapFollow({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) return;
    const current = map.getCenter();
    const currentZoom = map.getZoom();
    const latChanged = Math.abs(current.lat - center.lat) > 1e-6;
    const lonChanged = Math.abs(current.lng - center.lon) > 1e-6;
    const zoomChanged = typeof zoom === "number" && zoom !== currentZoom;

    // Only animate if something actually changed
    if (latChanged || lonChanged || zoomChanged) {
      const nextZoom = typeof zoom === "number" ? zoom : currentZoom;
      map.flyTo([center.lat, center.lon], nextZoom, { animate: true, duration: 0.8 });
    }
  }, [map, center, zoom]);

  return null;
}

// PUBLIC_INTERFACE
export default function App() {
  /** Travel Planner main app with Ocean Professional theme, split layout, and map-based planning. */
  const [profile, setProfile] = useLocalState("profile", "foot"); // foot, bike, car
  const [center, setCenter] = useLocalState("center", { lat: 48.8566, lon: 2.3522 }); // Paris
  const [zoom, setZoom] = useLocalState("zoom", 13);
  const [attractions, setAttractions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [itinerary, setItinerary] = useLocalState("itinerary", []);
  const [route, setRoute] = useState(null);
  const [radius, setRadius] = useLocalState("searchRadius", 1200);
  const [isFetching, setIsFetching] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [lastClick, setLastClick] = useState(null);
  const [query, setQuery] = useState("");

  // Derived
  const leafletCenter = useMemo(() => [center.lat, center.lon], [center]);

  const recalcRoute = useCallback(async (pts, mode) => {
    if (pts.length < 2) { setRoute(null); return; }
    setIsRouting(true);
    try {
      const r = await routeBetween(pts, mode);
      setRoute(r);
    } catch (e) {
      console.error(e);
      setRoute(null);
    } finally {
      setIsRouting(false);
    }
  }, []);

  // Recalculate route when itinerary or profile changes
  useEffect(() => {
    const pts = itinerary.map((i) => ({ lat: i.lat, lon: i.lon }));
    recalcRoute(pts, profile);
  }, [itinerary, profile, recalcRoute]);

  const handleFetchAttractions = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await fetchAttractionsAround(center.lat, center.lon, radius);
      // Basic filtering to interesting tags
      const filtered = res.filter((i) => {
        const t = i.tags || {};
        return !!(t.tourism || t.amenity || t.leisure || t.historic);
      });
      setAttractions(filtered.slice(0, 60));
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetching(false);
    }
  }, [center, radius]);

  // PUBLIC_INTERFACE
  async function geocodeCity(q) {
    /** Geocode a city or address using free OSM Nominatim and center the map. */
    if (!q || !q.trim()) return;
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
      if (!resp.ok) throw new Error(`Geocode error: ${resp.status}`);
      const arr = await resp.json();
      if (arr && arr[0]) {
        const lat = parseFloat(arr[0].lat);
        const lon = parseFloat(arr[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          // Update state; MapFollow will animate the map to this position.
          setCenter({ lat, lon });
          // Use a reasonable default zoom when jumping to a new search result.
          setZoom(14);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  // PUBLIC_INTERFACE
  async function locateMe() {
    /** Use browser geolocation to center and zoom the map on user's current location and add a "Your Location" entry with reverse-geocoded address. */
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    // Helper: reverse-geocode using OSM Nominatim
    async function reverseGeocode(lat, lon) {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
          lat
        )}&lon=${encodeURIComponent(lon)}&zoom=16&addressdetails=1`;
        const resp = await fetch(url, {
          headers: {
            "Accept": "application/json",
          },
        });
        if (!resp.ok) throw new Error(`Reverse geocode error: ${resp.status}`);
        const data = await resp.json();
        return data.display_name || null;
      } catch (e) {
        console.warn("Reverse geocoding failed:", e);
        return null;
      }
    }

    // Wrap geolocation in a promise for reliable async/await control flow
    const getPosition = () =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });

    try {
      const pos = await getPosition();
      const { latitude, longitude } = pos.coords;
      const lat = Number(latitude);
      const lon = Number(longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        alert("We received invalid coordinates from your device. Please try again.");
        return;
      }

      // Animate map to location with a suitable zoom; MapFollow observes state changes
      setCenter({ lat, lon });
      setZoom((z) => (typeof z === "number" ? Math.max(z, 15) : 15)); // ensure a close zoom

      // Reverse-geocode and add/update "Your Location" at top of itinerary
      const displayName = await reverseGeocode(lat, lon);
      const name =
        displayName?.length ? `Your Location — ${displayName}` : `Your Location — (${lat.toFixed(5)}, ${lon.toFixed(5)})`;

      setItinerary((prev) => {
        // If an entry already exists, move it to top and update its name/coords
        const existingIdx = prev.findIndex((p) => p.id === "your-location");
        const yourLocation = {
          id: "your-location",
          name,
          lat,
          lon,
          tags: { type: "your-location" },
        };
        if (existingIdx >= 0) {
          const cloned = [...prev];
          // Remove existing
          cloned.splice(existingIdx, 1);
          // Add to top
          return [yourLocation, ...cloned];
        }
        // Insert as the first item
        return [yourLocation, ...prev];
      });
    } catch (err) {
      console.error("Geolocation error:", err);
      // User-friendly error messages based on error codes
      const msg =
        err?.code === 1
          ? "Location permission denied. Please allow access to use Locate Me."
          : err?.code === 2
          ? "Position unavailable. Please try again near a window or outdoors."
          : err?.code === 3
          ? "Timed out while trying to determine your location."
          : "Unable to retrieve your location.";
      alert(msg);
    }
  }

  const discoverAtLastClick = useCallback(async () => {
    if (!lastClick) return;
    setIsFetching(true);
    try {
      const res = await fetchAttractionsAround(lastClick.lat, lastClick.lon, radius);
      const filtered = res.filter((i) => {
        const t = i.tags || {};
        return !!(t.tourism || t.amenity || t.leisure || t.historic);
      });
      setAttractions(filtered.slice(0, 60));
      setCenter({ lat: lastClick.lat, lon: lastClick.lon });
      setZoom((z) => Math.max(z, 14));
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetching(false);
    }
  }, [lastClick, radius]);

  const addToItinerary = useCallback((item) => {
    setItinerary((prev) => {
      if (prev.find((p) => p.id === item.id)) return prev;
      return [...prev, item];
    });
  }, [setItinerary]);

  const removeFromItinerary = useCallback((id) => {
    setItinerary((prev) => prev.filter((p) => p.id !== id));
  }, [setItinerary]);

  const clearItinerary = useCallback(() => setItinerary([]), [setItinerary]);

  const onMapClickAddWaypoint = useCallback((latlng) => {
    const point = {
      id: `custom/${Date.now()}`,
      name: `Point (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`,
      lat: latlng.lat,
      lon: latlng.lng,
      tags: { custom: "true" }
    };
    addToItinerary(point);
  }, [addToItinerary]);

  return (
    <div className="app" style={{ background: theme.colors.background }}>
      <nav className="navbar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            Travel Planner
            <div style={{ fontSize: 12, color: "#1D4ED8" }}>Ocean Professional</div>
          </div>
        </div>
        <div className="row">
          <span className="badge">No login required</span>
          <input
            className="input"
            placeholder="Search city or address (e.g., Rome, Tokyo)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 240 }}
            aria-label="Search city or address"
          />
          <button className="btn" onClick={() => geocodeCity(query)}>Search</button>
          <button className="btn ghost" onClick={locateMe} aria-label="Locate me">📍 Locate me</button>
          <button className="btn ghost" onClick={() => handleFetchAttractions()}>
            🔍 Discover nearby
          </button>
          <select
            className="select"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            aria-label="Travel mode"
            style={{ width: 140 }}
          >
            <option value="foot">Walking</option>
            <option value="bike">Cycling</option>
            <option value="car">Driving</option>
          </select>
        </div>
      </nav>

      <main className="workspace">
        <div className="left-panel">
          <Section
            title="Itinerary"
            right={
              <div className="row">
                <button className="btn danger" onClick={clearItinerary} disabled={itinerary.length === 0}>Clear</button>
              </div>
            }
          >
            <div className="list" aria-live="polite">
              {itinerary.length === 0 && (
                <div className="item">
                  <div>
                    <p className="item-title">No items yet</p>
                    <p className="item-sub">Tap on the map to add a custom point, or use Discover to find attractions.</p>
                  </div>
                </div>
              )}
              {itinerary.map((item, idx) => (
                <div className="item" key={item.id}>
                  <div>
                    <p className="item-title">
                      {idx + 1}.{" "}
                      {item.id === "your-location" && <span className="badge" style={{ marginRight: 6 }}>Your Location</span>}
                      {item.name}
                    </p>
                    <p className="item-sub">{item.lat.toFixed(4)}, {item.lon.toFixed(4)}</p>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button
                        className="btn ghost"
                        onClick={() => {
                          setCenter({ lat: item.lat, lon: item.lon });
                          setZoom((z) => Math.max(z, 15));
                        }}
                      >
                        Center
                      </button>
                      <button className="btn secondary" onClick={() => setSelected(item)}>Details</button>
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn danger" onClick={() => removeFromItinerary(item.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            {route && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#374151" }}>
                <strong>Route:</strong> {(route.distance/1000).toFixed(1)} km • {(route.duration/60).toFixed(0)} min ({profile})
              </div>
            )}
            {isRouting && <div className="badge" style={{ marginTop: 8 }}>Calculating route…</div>}
          </Section>

          <Section
            title="Discover attractions"
            right={
              <div className="row">
                <input
                  className="input"
                  type="number"
                  min={100}
                  step={100}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value) || 1200)}
                  style={{ width: 120 }}
                  aria-label="Search radius (m)"
                />
                <button className="btn" onClick={handleFetchAttractions} disabled={isFetching}>
                  {isFetching ? "Loading…" : "Search"}
                </button>
              </div>
            }
          >
            <div className="list">
              {attractions.length === 0 && (
                <div className="item">
                  <div>
                    <p className="item-title">No results yet</p>
                    <p className="item-sub">Press Search to load attractions around map center.</p>
                  </div>
                </div>
              )}
              {attractions.map((a) => (
                <div className="item" key={a.id}>
                  <div>
                    <p className="item-title">{a.name}</p>
                    <p className="item-sub">
                      {(a.tags.tourism || a.tags.amenity || a.tags.leisure || a.tags.historic || "place")}
                      {" · "}
                      {a.lat.toFixed(4)}, {a.lon.toFixed(4)}
                    </p>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="btn ghost" onClick={() => { setCenter({ lat: a.lat, lon: a.lon }); setZoom((z) => Math.max(z, 14)); }}>Center</button>
                      <button className="btn secondary" onClick={() => setSelected(a)}>Details</button>
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn" onClick={() => addToItinerary(a)}>Add</button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="map-card">
          <div className="map-toolbar">
            <span className="badge">Center: {center.lat.toFixed(4)}, {center.lon.toFixed(4)}</span>
            <button className="btn ghost" onClick={() => setZoom((z) => Math.min(18, z + 1))}>＋</button>
            <button className="btn ghost" onClick={() => setZoom((z) => Math.max(3, z - 1))}>－</button>
            <button className="btn ghost" onClick={discoverAtLastClick} disabled={!lastClick || isFetching}>
              {isFetching ? "Discovering…" : "Discover here"}
            </button>
          </div>
          <MapContainer
            center={leafletCenter}
            zoom={zoom}
            whenReady={() => setMapReady(true)}
            style={{ width: "100%", height: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapSync onCenterZoomChange={({ lat, lon, zoom: z }) => { setCenter({ lat, lon }); setZoom(z); }} />
            <MapFollow center={center} zoom={zoom} />
            <ClickCapture onClick={(ll) => { setLastClick({ lat: ll.lat, lon: ll.lng }); onMapClickAddWaypoint(ll); }} />
            {/* Current center marker */}
            <Marker position={[center.lat, center.lon]}>
              <Popup>
                {itinerary[0]?.id === "your-location" &&
                  Math.abs(itinerary[0].lat - center.lat) < 1e-4 &&
                  Math.abs(itinerary[0].lon - center.lon) < 1e-4 ? (
                  <strong>Your Location</strong>
                ) : (
                  <strong>Map center</strong>
                )}
                <br />
                {center.lat.toFixed(4)}, {center.lon.toFixed(4)}
              </Popup>
            </Marker>
            {/* Attraction markers */}
            {attractions.map((a) => (
              <Marker key={a.id} position={[a.lat, a.lon]}>
                <Popup>
                  <strong>{a.name}</strong><br />
                  {(a.tags.tourism || a.tags.amenity || a.tags.leisure || a.tags.historic || "place")}
                  <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => addToItinerary(a)}>Add</button>
                    <button className="btn secondary" onClick={() => setSelected(a)}>Details</button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {/* Itinerary markers */}
            {itinerary.map((p) => (
              <Marker key={`it-${p.id}`} position={[p.lat, p.lon]}>
                <Popup>
                  <strong>{p.name}</strong><br />
                  {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                  <div style={{ marginTop: 8 }}>
                    <button className="btn danger" onClick={() => removeFromItinerary(p.id)}>Remove</button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {/* Route polyline */}
            {route?.geometry && (
              <Polyline
                positions={route.geometry.coordinates.map(([x, y]) => [y, x])}
                pathOptions={{ color: theme.colors.primary, weight: 5, opacity: 0.8 }}
              />
            )}
          </MapContainer>
        </div>
      </main>

      <Modal
        title={selected?.name || "Details"}
        open={!!selected}
        onClose={() => setSelected(null)}
        footer={
          <div className="row">
            {selected && <button className="btn" onClick={() => { addToItinerary(selected); setSelected(null); }}>Add to itinerary</button>}
            <button className="btn ghost" onClick={() => setSelected(null)}>Close</button>
          </div>
        }
      >
        {selected && (
          <div>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="badge">{selected.tags?.tourism || selected.tags?.amenity || selected.tags?.leisure || selected.tags?.historic || "place"}</span>
              <span className="badge">{selected.type || "node"}</span>
            </div>
            <p style={{ marginTop: 0, color: "#374151" }}>
              Coordinates: {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}
            </p>
            {selected.tags && (
              <div className="panel">
                <h4 className="panel-title">Tags</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {Object.entries(selected.tags).slice(0, 16).map(([k, v]) => (
                    <div key={k} className="item" style={{ gridTemplateColumns: "1fr" }}>
                      <div style={{ fontSize: 12, color: "#6B7280" }}>{k}</div>
                      <div style={{ fontSize: 14 }}>{String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
