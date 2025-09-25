import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { theme } from "./theme";
import { fetchAttractionsAround, routeBetween, nominatimSearchPlaces, reverseGeocode } from "./api";
import { getGooglePlaceDetailsByText, getGoogleDirectionsSummary, travelSafetyTip } from "./google";

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

/**
 * Helper: categories mapping for "All Places", Pilgrim, Nature, Historic, Attractions.
 * "All Places" includes a broad set of common POI keys.
 */
const CATEGORY_OPTIONS = [
  {
    key: "all",
    label: "All Places",
    overpassFilters: [
      "tourism",
      "amenity",
      "leisure",
      "historic",
      "natural",
      "heritage",
      "place",
      "shop",
      "man_made",
      "attraction",
      "tourism=attraction",
      "amenity=place_of_worship",
      "leisure=park",
      "boundary=national_park",
      "natural=peak",
      "natural=waterfall",
    ],
  },
  {
    key: "pilgrim",
    label: "Pilgrimage",
    overpassFilters: [
      "amenity=place_of_worship",
      "tourism=attraction",
      "historic=monument",
      "historic=wayside_shrine",
    ],
  },
  {
    key: "nature",
    label: "Nature",
    overpassFilters: [
      "tourism=viewpoint",
      "tourism=attraction",
      "natural=waterfall",
      "natural=peak",
      "natural=wood",
      "waterway=river",
      "leisure=park",
      "leisure=nature_reserve",
      "landuse=forest",
      "boundary=national_park",
    ],
  },
  {
    key: "historic",
    label: "Historical",
    overpassFilters: [
      "historic",
      "tourism=attraction",
      "heritage",
      "historic=castle",
      "historic=archaeological_site",
      "historic=ruins",
      "historic=monument",
      "historic=memorial",
    ],
  },
  {
    key: "attractions",
    label: "Attractions",
    overpassFilters: [
      "tourism=attraction",
      "tourism=museum",
      "leisure=park",
      "amenity=theatre",
      "amenity=arts_centre",
      "amenity=cinema",
      "historic=monument",
      "natural=waterfall",
      "natural=peak",
    ],
  },
];

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
  const [selectedPlaceIds, setSelectedPlaceIds] = useState(() => new Set());
  const [resultsCapped, setResultsCapped] = useState(false);
  const [radius, setRadius] = useLocalState("searchRadius", 1200);
  const [isFetching, setIsFetching] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [lastClick, setLastClick] = useState(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [category, setCategory] = useLocalState("discoverCategory", "all"); // all, pilgrim, nature, historic
  const [startMode, setStartMode] = useLocalState("startMode", "current"); // current | custom
  const [customStart, setCustomStart] = useLocalState("customStart", null); // {lat, lon, name, id}

  // Derived
  const leafletCenter = useMemo(() => [center.lat, center.lon], [center]);

  // Recalculate route when itinerary, profile, or start choice changes
  const recalcRoute = useCallback(async () => {
    // Build route points starting with chosen starting point
    const points = [];
    if (startMode === "current" && itinerary.length > 0 && itinerary[0].id === "your-location") {
      points.push({ lat: itinerary[0].lat, lon: itinerary[0].lon });
      // remaining itinerary after "your-location"
      itinerary.slice(1).forEach((i) => points.push({ lat: i.lat, lon: i.lon }));
    } else if (startMode === "custom" && customStart) {
      points.push({ lat: customStart.lat, lon: customStart.lon });
      itinerary.forEach((i) => points.push({ lat: i.lat, lon: i.lon }));
    } else {
      // default: just use itinerary
      itinerary.forEach((i) => points.push({ lat: i.lat, lon: i.lon }));
    }

    if (points.length < 2) { setRoute(null); return; }
    setIsRouting(true);
    try {
      const r = await routeBetween(points, profile);
      setRoute(r);
    } catch (e) {
      console.error(e);
      setRoute(null);
    } finally {
      setIsRouting(false);
    }
  }, [itinerary, profile, startMode, customStart]);

  useEffect(() => {
    recalcRoute();
  }, [recalcRoute]);

  const categoryFilters = useMemo(() => {
    const opt = CATEGORY_OPTIONS.find((o) => o.key === category) || CATEGORY_OPTIONS[0];
    return opt.overpassFilters;
  }, [category]);

  const handleFetchAttractions = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await fetchAttractionsAround(center.lat, center.lon, radius, categoryFilters);
      // Keep all relevant items; show as many as API returns but cap UI for performance
      const filtered = res.filter((i) => {
        const t = i.tags || {};
        return !!(t.tourism || t.amenity || t.leisure || t.historic || t.natural || t.heritage || t.place || t.shop || t.man_made);
      });
      const MAX_SHOW = 120;
      setResultsCapped(filtered.length > MAX_SHOW);
      setAttractions(filtered.slice(0, MAX_SHOW));
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetching(false);
    }
  }, [center, radius, categoryFilters]);

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
          setCenter({ lat, lon });
          setZoom(14);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  // PUBLIC_INTERFACE
  async function locateMe() {
    /** Use browser geolocation to center and zoom the map on user's current location and add/update a "Your Location" entry with reverse-geocoded address. */
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
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

      setCenter({ lat, lon });
      setZoom((z) => (typeof z === "number" ? Math.max(z, 15) : 15));

      const displayName = await reverseGeocode(lat, lon);
      const name =
        displayName?.length ? `Your Location — ${displayName}` : `Your Location — (${lat.toFixed(5)}, ${lon.toFixed(5)})`;

      setItinerary((prev) => {
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
          cloned.splice(existingIdx, 1);
          return [yourLocation, ...cloned];
        }
        return [yourLocation, ...prev];
      });
    } catch (err) {
      console.error("Geolocation error:", err);
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
      const res = await fetchAttractionsAround(lastClick.lat, lastClick.lon, radius, categoryFilters);
      const filtered = res.filter((i) => {
        const t = i.tags || {};
        return !!(t.tourism || t.amenity || t.leisure || t.historic || t.natural || t.heritage);
      });
      setAttractions(filtered.slice(0, 80));
      setCenter({ lat: lastClick.lat, lon: lastClick.lon });
      setZoom((z) => Math.max(z, 14));
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetching(false);
    }
  }, [lastClick, radius, categoryFilters]);

  const addToItinerary = useCallback((item) => {
    setItinerary((prev) => {
      if (prev.find((p) => p.id === item.id)) return prev;
      return [...prev, item];
    });
    setSelectedPlaceIds((prev) => new Set([...prev, item.id]));
  }, [setItinerary]);

  const removeFromItinerary = useCallback((id) => {
    setItinerary((prev) => prev.filter((p) => p.id !== id));
    setSelectedPlaceIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [setItinerary]);

  const clearItinerary = useCallback(() => {
    setItinerary([]);
    setSelectedPlaceIds(new Set());
  }, [setItinerary]);

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

  // Handle manual search for places to add
  const [placeQuery, setPlaceQuery] = useState("");
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const doPlaceSearch = useCallback(async () => {
    if (!placeQuery.trim()) { setSearchResults([]); return; }
    setSearchingPlaces(true);
    try {
      const results = await nominatimSearchPlaces(placeQuery, center);
      setSearchResults(results);
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setSearchingPlaces(false);
    }
  }, [placeQuery, center]);

  // Update custom start from center quickly
  const setCustomStartFromCenter = useCallback(async () => {
    const name = await reverseGeocode(center.lat, center.lon);
    setCustomStart({
      id: "custom-start",
      name: name || `Custom Start (${center.lat.toFixed(4)}, ${center.lon.toFixed(4)})`,
      lat: center.lat,
      lon: center.lon,
    });
  }, [center]);

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
            title="Choose a profile for the safest route on OSRM"
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
            title="Plan your trip"
            right={
              <div className="row">
                <div className="row" role="group" aria-label="Starting point selection">
                  <button
                    className={`btn ghost ${startMode === "current" ? "" : ""}`}
                    onClick={() => setStartMode("current")}
                    aria-pressed={startMode === "current"}
                    title="Start from current location (Your Location)"
                  >
                    Start: Current
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => setStartMode("custom")}
                    aria-pressed={startMode === "custom"}
                    title="Start from a custom point"
                  >
                    Start: Custom
                  </button>
                </div>
              </div>
            }
          >
            {startMode === "custom" && (
              <div className="panel" style={{ marginBottom: 8 }}>
                <div className="row">
                  <span className="badge">Custom starting point</span>
                  <button className="btn ghost" onClick={setCustomStartFromCenter}>Use map center</button>
                </div>
                <div style={{ marginTop: 8 }}>
                  {customStart ? (
                    <div className="item" style={{ gridTemplateColumns: "1fr auto" }}>
                      <div>
                        <p className="item-title">{customStart.name}</p>
                        <p className="item-sub">{customStart.lat.toFixed(4)}, {customStart.lon.toFixed(4)}</p>
                      </div>
                      <div className="row">
                        <button className="btn ghost" onClick={() => { setCenter({ lat: customStart.lat, lon: customStart.lon }); setZoom((z) => Math.max(z, 15)); }}>Center</button>
                        <button className="btn danger" onClick={() => setCustomStart(null)}>Clear</button>
                      </div>
                    </div>
                  ) : (
                    <p className="item-sub" style={{ margin: 0 }}>
                      No custom start set. Use "Use map center" or pick a place below and set as start.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="panel" style={{ marginBottom: 8 }}>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Add places</div>
                  <div className="row">
                    <input
                      className="input"
                      placeholder="Search places (e.g., Taj Mahal, Yosemite)"
                      value={placeQuery}
                      onChange={(e) => setPlaceQuery(e.target.value)}
                      style={{ width: 240 }}
                      aria-label="Search places"
                    />
                    <button className="btn" onClick={doPlaceSearch} disabled={searchingPlaces}>
                      {searchingPlaces ? "Searching…" : "Search"}
                    </button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Category</div>
                  <div className="row" role="tablist" aria-label="Category">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        className={`btn ghost ${category === opt.key ? "" : ""}`}
                        onClick={() => setCategory(opt.key)}
                        aria-selected={category === opt.key}
                        role="tab"
                        title={opt.label}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Radius (m)</div>
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
                </div>
                <button className="btn secondary" onClick={handleFetchAttractions} disabled={isFetching}>
                  {isFetching ? "Loading…" : "Discover nearby"}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="panel" style={{ marginTop: 8 }}>
                  <h4 className="panel-title">Search results</h4>
                  <div className="list">
                    {searchResults.map((r) => (
                      <div key={r.id} className="item">
                        <div>
                          <p className="item-title">{r.name}</p>
                          <p className="item-sub">{r.lat.toFixed(4)}, {r.lon.toFixed(4)}</p>
                          <div className="row" style={{ marginTop: 8 }}>
                            <button className="btn ghost" onClick={() => { setCenter({ lat: r.lat, lon: r.lon }); setZoom((z) => Math.max(z, 14)); }}>Center</button>
                            <button className="btn" onClick={() => addToItinerary(r)}>Add</button>
                            {startMode === "custom" && (
                              <button
                                className="btn secondary"
                                onClick={() => setCustomStart({ ...r, id: "custom-start" })}
                                title="Set as custom start"
                              >
                                Set as start
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="list" aria-live="polite">
              {itinerary.length === 0 && (
                <div className="item">
                  <div>
                    <p className="item-title">No items yet</p>
                    <p className="item-sub">Tap on the map to add a custom point, search places, or use Discover.</p>
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
            <div className="panel" style={{ marginTop: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="row">
                  <span className="badge">Selected: {selectedPlaceIds.size}</span>
                  {route && (
                    <span className="badge" title="Total distance and duration of the recommended route">
                      {(route.distance/1000).toFixed(1)} km • {(route.duration/60).toFixed(0)} min
                    </span>
                  )}
                </div>
                <div className="row">
                  <button className="btn ghost" onClick={recalcRoute} disabled={isRouting || itinerary.length < 2}>
                    {isRouting ? "Routing…" : "Recalculate route"}
                  </button>
                  <button className="btn ghost" onClick={clearItinerary} disabled={itinerary.length === 0}>Clear itinerary</button>
                </div>
              </div>
            </div>
          </Section>

          <Section
            title={`Discover places — ${CATEGORY_OPTIONS.find(c => c.key === category)?.label || ""}`}
            right={
              <div className="row">
                <button className="btn" onClick={handleFetchAttractions} disabled={isFetching}>
                  {isFetching ? "Loading…" : "Search"}
                </button>
              </div>
            }
          >
            {resultsCapped && (
              <div className="badge" title="More results available; refine radius or pan the map to load more.">
                Showing first {attractions.length} results (more available)
              </div>
            )}
            <div className="list">
              {attractions.length === 0 && (
                <div className="item">
                  <div>
                    <p className="item-title">No results yet</p>
                    <p className="item-sub">Press Discover nearby to load attractions around map center.</p>
                  </div>
                </div>
              )}
              {attractions.map((a) => {
                const isSelected = selectedPlaceIds.has(a.id);
                return (
                  <div className="item" key={a.id} style={isSelected ? { borderColor: "#2563EB", background: "#EFF6FF" } : undefined}>
                    <div>
                      <p className="item-title">
                        {a.name} {isSelected && <span className="badge" style={{ marginLeft: 6 }}>Selected</span>}
                      </p>
                      <p className="item-sub">
                        {(a.desc || a.tags.tourism || a.tags.amenity || a.tags.leisure || a.tags.historic || a.tags.natural || "place")}
                        {" · "}
                        Rating: N/A • Reviews: N/A
                      </p>
                      <p className="item-sub" style={{ marginTop: 2 }}>
                        {a.lat.toFixed(4)}, {a.lon.toFixed(4)}
                      </p>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button
                          className="btn ghost"
                          onClick={() => { setCenter({ lat: a.lat, lon: a.lon }); setZoom((z) => Math.max(z, 14)); }}
                        >
                          Center
                        </button>
                        {!isSelected ? (
                          <button className="btn" onClick={() => addToItinerary(a)}>Add</button>
                        ) : (
                          <button className="btn danger" onClick={() => removeFromItinerary(a.id)}>Remove</button>
                        )}
                        {startMode === "custom" && (
                          <button
                            className="btn secondary"
                            onClick={() => setCustomStart({ ...a, id: "custom-start" })}
                            title="Set as custom start"
                          >
                            Set as start
                          </button>
                        )}
                        <button className="btn ghost" onClick={() => setSelected(a)}>Details</button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
            {/* Custom start marker */}
            {startMode === "custom" && customStart && (
              <Marker position={[customStart.lat, customStart.lon]}>
                <Popup>
                  <strong>Custom Start</strong><br />
                  {customStart.name}<br />
                  {customStart.lat.toFixed(4)}, {customStart.lon.toFixed(4)}
                </Popup>
              </Marker>
            )}
            {/* Only show markers for user-selected places (itinerary) */}
            {/* Attraction discovery results are listed in the left panel, not shown on the map until selected */}
            {/* Itinerary markers */}
            {itinerary.map((p, idx) => (
              <Marker key={`it-${p.id}`} position={[p.lat, p.lon]}>
                <Popup>
                  <div className="row" style={{ marginBottom: 6 }}>
                    <span className="badge" title="Trip order">{idx + 1}</span>
                    {p.id === "your-location" && <span className="badge">Start</span>}
                  </div>
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
                pathOptions={{ color: theme.colors.primary, weight: 6, opacity: 0.9 }}
              />
            )}
          </MapContainer>
        </div>
      </main>

      <Modal
        title={selected?.name || "Trip Advisor"}
        open={!!selected}
        onClose={() => setSelected(null)}
        footer={
          <div className="row">
            {selected && !selectedPlaceIds.has(selected.id) && (
              <button className="btn" onClick={() => { addToItinerary(selected); setSelected(null); }}>Add to itinerary</button>
            )}
            {selected && selectedPlaceIds.has(selected.id) && (
              <button className="btn danger" onClick={() => { removeFromItinerary(selected.id); setSelected(null); }}>Remove</button>
            )}
            <button className="btn ghost" onClick={() => setSelected(null)}>Close</button>
          </div>
        }
      >
        {selected && <TripAdvisorPanel place={selected} profile={profile} itinerary={itinerary} />}
      </Modal>
    </div>
  );
}

/**
 * TripAdvisorPanel: shows official place details (Google if available), rating/reviews,
 * an estimated route/time from previous itinerary stop (or start), and a basic travel tip.
 */
/* PUBLIC_INTERFACE */
function TripAdvisorPanel({ place, profile, itinerary }) {
  /** Displays Trip Advisor summary for a place using optional Google data and best-available routing. */
  const [gInfo, setGInfo] = useState(null);
  const [dir, setDir] = useState(null);
  const [loading, setLoading] = useState(true);

  const prevPoint = useMemo(() => {
    const idx = itinerary.findIndex((it) => it.id === place.id);
    if (idx > 0) return itinerary[idx - 1];
    // if not in itinerary yet, pick the last itinerary point as origin
    if (itinerary.length > 0) return itinerary[itinerary.length - 1];
    return null;
  }, [itinerary, place.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [gi, dr] = await Promise.all([
          getGooglePlaceDetailsByText(place.name),
          prevPoint
            ? getGoogleDirectionsSummary(
                [
                  { lat: prevPoint.lat, lon: prevPoint.lon },
                  { lat: place.lat, lon: place.lon },
                ],
                profile
              )
            : Promise.resolve({ ok: true, route: { distance: null, duration: null }, simulated: true }),
        ]);
        if (!cancelled) {
          setGInfo(gi);
          setDir(dr);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [place, prevPoint, profile]);

  const rating = gInfo?.ok ? gInfo.place?.rating : null;
  const reviews = gInfo?.ok ? gInfo.place?.user_ratings_total : null;
  const officialName = gInfo?.ok && gInfo.place?.name ? gInfo.place.name : place.name;
  const address = gInfo?.ok ? gInfo.place?.formatted_address : "";

  const distanceKm =
    typeof dir?.route?.distance === "number" ? (dir.route.distance / 1000).toFixed(1) : "N/A";
  const durationMin =
    typeof dir?.route?.duration === "number" ? Math.round(dir.route.duration / 60) : "N/A";

  const tip = travelSafetyTip(profile);

  return (
    <div>
      <div className="panel" style={{ marginBottom: 8 }}>
        <h4 className="panel-title">Official details</h4>
        <p style={{ margin: "4px 0", fontWeight: 600 }}>{officialName}</p>
        {address && <p className="item-sub" style={{ marginTop: 0 }}>{address}</p>}
        <p className="item-sub" style={{ marginTop: 0 }}>
          Coordinates: {place.lat.toFixed(5)}, {place.lon.toFixed(5)}
        </p>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="badge">Rating: {rating ?? "N/A"}</span>
          <span className="badge">Reviews: {reviews ?? "N/A"}</span>
          {gInfo?.simulated && (
            <span className="badge" title="Provide REACT_APP_GOOGLE_MAPS_API_KEY to enable real ratings">Simulated</span>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 8 }}>
        <h4 className="panel-title">Best route</h4>
        {prevPoint ? (
          <>
            <p className="item-sub" style={{ marginTop: 0 }}>
              From: {prevPoint.name}
            </p>
            <div className="row">
              <span className="badge">{profile === "car" ? "Driving" : profile === "bike" ? "Cycling" : "Walking"}</span>
              <span className="badge">Distance: {distanceKm} km</span>
              <span className="badge">Time: {durationMin} min</span>
              {dir?.simulated && (
                <span className="badge" title="Provide Google API key to enable Directions">Simulated</span>
              )}
            </div>
          </>
        ) : (
          <p className="item-sub" style={{ marginTop: 0 }}>
            Add a starting point or another place to estimate travel distance and time.
          </p>
        )}
      </div>

      <div className="panel">
        <h4 className="panel-title">Safety tip</h4>
        <p className="item-sub" style={{ marginTop: 0 }}>{tip}</p>
      </div>

      {loading && (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="badge">Fetching details…</span>
        </div>
      )}
    </div>
  );
}
