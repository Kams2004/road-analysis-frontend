/**
 * Route-search helpers shared by the Detection map, Historical risk analysis
 * and Community reporting pages (backend: app/api/routes/route_sections.py).
 *
 *   GET /routes/sections          predefined road sections (tronçons) + corridor
 *   GET /routes/preview           OSRM route(s) between two points
 *   GET /routes/geocode/search    place autocomplete (Nominatim via the API)
 *   GET /routes/geocode/reverse   "Ndoghem, Douala" for a position
 *
 * Geocoding falls back to calling Nominatim directly when the API proxy is
 * unavailable (older backend).
 */
import { request } from "@/lib/auth-api"

const P = "/api/proxy"

export type LatLon = [number, number]

export interface Place {
  label: string
  secondary?: string
  lat: number
  lon: number
}

export interface RouteEndpoint { lat: number; lon: number; label: string }
export interface RouteSection { id: string; name: string; from: RouteEndpoint; to: RouteEndpoint }
export interface RouteSectionsOut { sections: RouteSection[]; corridor_m: number }

export interface RoutePreview { geometry: LatLon[]; distance_m: number; duration_s: number }

/** [lon1, lat1, lon2, lat2] — preferred search area (e.g. the current map view). */
export type ViewBox = [number, number, number, number]

let sectionsCache: Promise<RouteSectionsOut> | null = null

export function getRouteSections(fresh = false): Promise<RouteSectionsOut> {
  if (fresh || !sectionsCache) {
    sectionsCache = request<RouteSectionsOut>(`${P}/routes/sections`).catch((e) => {
      sectionsCache = null
      throw e
    })
  }
  return sectionsCache
}

export function invalidateRouteSections() {
  sectionsCache = null
}

export async function fetchRoutePreview(from: LatLon, to: LatLon, alternatives = true): Promise<RoutePreview[]> {
  const qs = new URLSearchParams({
    from: `${from[0]},${from[1]}`, to: `${to[0]},${to[1]}`, alternatives: String(alternatives),
  })
  const r = await fetch(`${P}/routes/preview?${qs}`, { cache: "no-store" })
  if (r.status === 404) throw new Error("no_route")
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data: { routes: RoutePreview[] } = await r.json()
  if (!data.routes?.length) throw new Error("no_route")
  return data.routes
}

// ── Geocoding ────────────────────────────────────────────────────────────────

const CAMEROON: ViewBox = [8.4, 13.1, 16.2, 1.6]

interface NominatimRow {
  name?: string
  display_name: string
  lat: string
  lon: string
  address?: Record<string, string>
}

const arrondissement = (c?: string) => c?.replace(/\s+[IVX]{1,4}$/, "")

function fromNominatim(r: NominatimRow): Place {
  const a = r.address ?? {}
  const parts = r.display_name.split(", ")
  const label = r.name || parts[0]
  const city = arrondissement(a.city ?? a.town ?? a.village ?? a.municipality)
  const secondary = [...new Set([city !== label ? city : undefined, a.state].filter(Boolean))].join(", ")
  return { label, secondary: secondary || parts.slice(1, 3).join(", "), lat: Number(r.lat), lon: Number(r.lon) }
}

export async function searchPlaces(q: string, lang: string, signal?: AbortSignal, viewbox?: ViewBox | null): Promise<Place[]> {
  const vb = (viewbox ?? CAMEROON).map((n) => n.toFixed(4)).join(",")
  try {
    const qs = new URLSearchParams({ q, lang, viewbox: vb })
    const r = await fetch(`${P}/routes/geocode/search?${qs}`, { cache: "no-store", signal })
    if (r.ok) return (await r.json()) as Place[]
    if (r.status === 401 || r.status === 403) return []
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e
  }
  // Fallback: Nominatim directly from the browser.
  const qs = new URLSearchParams({
    q, format: "jsonv2", limit: "6", countrycodes: "cm", addressdetails: "1", viewbox: vb, "accept-language": lang,
  })
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { signal })
  if (!r.ok) return []
  return ((await r.json()) as NominatimRow[]).map(fromNominatim)
}

export async function reversePlace(lat: number, lon: number, lang: string): Promise<Place> {
  const fallback: Place = { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon }
  try {
    const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), lang })
    const r = await fetch(`${P}/routes/geocode/reverse?${qs}`, { cache: "no-store" })
    if (r.ok) return { ...(await r.json()), lat, lon }
  } catch { /* fall through */ }
  try {
    const qs = new URLSearchParams({
      lat: String(lat), lon: String(lon), format: "jsonv2", zoom: "16", addressdetails: "1", "accept-language": lang,
    })
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?${qs}`)
    if (!r.ok) return fallback
    const d: NominatimRow = await r.json()
    const a = d.address ?? {}
    const local = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.road
    const city = arrondissement(a.city ?? a.town ?? a.village ?? a.municipality)
    const label = [...new Set([local, city].filter(Boolean))].join(", ")
    return { ...fallback, label: label || fallback.label, secondary: a.state }
  } catch {
    return fallback
  }
}

// ── Geometry ─────────────────────────────────────────────────────────────────

const K = Math.PI / 180

/** Shortest distance (m) from a point to a polyline (equirectangular, fine for corridors). */
export function distanceToPolylineM(p: LatLon, line: LatLon[]): number {
  if (line.length === 0) return Infinity
  const cos = Math.cos(p[0] * K)
  const xy = (q: LatLon) => [(q[1] - p[1]) * K * cos * 6371000, (q[0] - p[0]) * K * 6371000] as const
  let best = Infinity
  let prev = xy(line[0])
  if (line.length === 1) return Math.hypot(prev[0], prev[1])
  for (let i = 1; i < line.length; i++) {
    const cur = xy(line[i])
    const dx = cur[0] - prev[0], dy = cur[1] - prev[1]
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, -(prev[0] * dx + prev[1] * dy) / len2)) : 0
    const d = Math.hypot(prev[0] + t * dx, prev[1] + t * dy)
    if (d < best) best = d
    prev = cur
  }
  return best
}

/** Bounding box of a polyline, padded by `padM` metres — cheap pre-filter. */
export function polylineBounds(line: LatLon[], padM: number) {
  let s = 90, n = -90, w = 180, e = -180
  for (const [la, lo] of line) { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo) }
  const dLat = padM / 111320
  const dLon = padM / (111320 * Math.max(0.1, Math.cos(((s + n) / 2) * K)))
  return { s: s - dLat, n: n + dLat, w: w - dLon, e: e + dLon }
}

/** Items within `corridorM` metres of the route. */
export function filterAlongRoute<T>(items: T[], route: LatLon[], corridorM: number, at: (x: T) => LatLon | null): T[] {
  if (route.length < 2) return items
  const b = polylineBounds(route, corridorM)
  return items.filter((x) => {
    const p = at(x)
    if (!p || p[0] < b.s || p[0] > b.n || p[1] < b.w || p[1] > b.e) return false
    return distanceToPolylineM(p, route) <= corridorM
  })
}
