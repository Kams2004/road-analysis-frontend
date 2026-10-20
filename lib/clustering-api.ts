/**
 * Typed client for the global Cluster Configuration (Module 6 —
 * RRAP-06-009/010/011): urban / out-of-agglomeration profiles, cluster
 * zones (agglomerations, road-section corridors, custom polygons),
 * boundary search and "test a point". Contract: api/docs/spec-module6-clustering.md.
 */
import { request } from "@/lib/auth-api"

const P = "/api/proxy"

export type Environment = "urban" | "rural"
export type ZoneKind = "agglomeration" | "road_section" | "custom"
export type RadiusMap = Record<string, number>

/** GeoJSON geometry ([lon, lat] order). */
export interface Geometry {
  type: "Polygon" | "MultiPolygon" | "LineString" | "MultiLineString" | "Point"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  coordinates: any
}

export interface ClusterProfile {
  default_radius_m: number
  type_radius: RadiusMap
  signalement_radius: RadiusMap
}

export interface ClusteringConfig {
  urban: ClusterProfile
  rural: ClusterProfile
  unzoned_environment: Environment
  merge_signalements: boolean
  default_corridor_width_m: number
  detection_types: string[]
  signalement_types: string[]
  zone_count: number
  min_radius_m: number
  max_radius_m: number
}

export type ClusteringConfigPatch = Partial<Pick<ClusteringConfig,
  "unzoned_environment" | "merge_signalements" | "default_corridor_width_m">> & {
  urban?: Partial<ClusterProfile>
  rural?: Partial<ClusterProfile>
}

export interface ClusterZone {
  id: number
  name: string
  kind: ZoneKind
  environment: Environment
  default_radius_m: number | null
  type_radius: RadiusMap | null
  signalement_radius: RadiusMap | null
  priority: number
  is_active: boolean
  country: string | null
  city: string | null
  corridor_width_m: number | null
  area_km2: number
  bbox: [number, number, number, number]
  center: [number, number] | null
  source: "nominatim" | "drawn" | "route" | "legacy_area"
  source_ref: string | null
  source_meta: Record<string, unknown> | null
  vertices: number
  geometry: Geometry | null
  outline: Geometry | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ZoneFeature {
  type: "Feature"
  id: number
  geometry: Geometry
  properties: {
    id: number
    name: string
    kind: ZoneKind
    environment: Environment
    is_active: boolean
    priority: number
    default_radius_m: number | null
    type_radius: RadiusMap | null
    signalement_radius: RadiusMap | null
    corridor_width_m: number | null
    area_km2: number
    centerline: Geometry | null
  }
}
export interface ZoneCollection { type: "FeatureCollection"; features: ZoneFeature[] }

export interface ZoneInput {
  name: string
  kind: ZoneKind
  environment?: Environment
  geometry: Geometry
  corridor_width_m?: number | null
  default_radius_m?: number | null
  type_radius?: RadiusMap | null
  signalement_radius?: RadiusMap | null
  priority?: number | null
  is_active?: boolean
  country?: string | null
  city?: string | null
  source?: "nominatim" | "drawn" | "route"
  source_ref?: string | null
  source_meta?: Record<string, unknown> | null
}

export type ZonePatch = Partial<Omit<ZoneInput, "kind" | "source" | "source_ref" | "source_meta">>

export interface BoundaryCandidate {
  display_name: string
  name: string
  osm_type: string | null
  osm_id: number | null
  class: string | null
  type: string | null
  addresstype: string | null
  lat: number
  lon: number
  bbox: [number, number, number, number] | null
  area_km2: number
  vertices: number
  approximate: boolean
  geometry: Geometry
}

export interface Resolution {
  radius_m: number
  environment: Environment
  source: "zone_type" | "zone_default" | "profile_type" | "profile_default"
  category: "detection" | "signalement"
  type: string | null
  zone_id: number | null
  zone_name: string | null
  zone_kind: ZoneKind | null
}

export interface PointResolution {
  zone: { id: number; name: string; kind: ZoneKind; environment: Environment; priority: number } | null
  environment: Environment
  default: Resolution
  detections: Record<string, Resolution>
  signalements: Record<string, Resolution>
}

export interface RoadSectionInput {
  name?: string
  route_key?: string
  start?: [number, number]
  end?: [number, number]
  corridor_width_m?: number
  environment?: Environment
  default_radius_m?: number | null
  type_radius?: RadiusMap | null
  signalement_radius?: RadiusMap | null
  priority?: number | null
  is_active?: boolean
  preview?: boolean
}

export interface RoadSectionOut {
  zone: ClusterZone | null
  name: string
  geometry: Geometry
  outline: Geometry | null
  corridor_width_m: number
  distance_m: number
  area_km2: number
}

const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ""
}

const send = <T,>(url: string, method: string, body?: unknown) =>
  request<T>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const getClusteringConfig = () => request<ClusteringConfig>(`${P}/clustering/config`)
export const saveClusteringConfig = (patch: ClusteringConfigPatch) =>
  send<ClusteringConfig>(`${P}/clustering/config`, "PUT", patch)
export const rebuildHazards = () =>
  send<{ hazards: number }>(`${P}/clustering/rebuild-hazards?confirm=true`, "POST")

export const listZones = (f: { kind?: ZoneKind; environment?: Environment; active?: boolean; q?: string } = {}) =>
  request<ClusterZone[]>(`${P}/cluster-zones/${qs(f)}`)
export const zonesGeoJSON = () => request<ZoneCollection>(`${P}/cluster-zones/geojson`)
export const getZone = (id: number) => request<ClusterZone>(`${P}/cluster-zones/${id}`)
export const createZone = (body: ZoneInput) => send<ClusterZone>(`${P}/cluster-zones/`, "POST", body)
export const updateZone = (id: number, body: ZonePatch) => send<ClusterZone>(`${P}/cluster-zones/${id}`, "PATCH", body)
export const deleteZone = (id: number) => send<void>(`${P}/cluster-zones/${id}`, "DELETE")
export const searchBoundaries = (q: string) =>
  request<BoundaryCandidate[]>(`${P}/cluster-zones/boundary-search${qs({ q })}`)
export const resolvePoint = (lat: number, lon: number) =>
  request<PointResolution>(`${P}/cluster-zones/resolve${qs({ lat, lon })}`)
export const createRoadSection = (body: RoadSectionInput) =>
  send<RoadSectionOut>(`${P}/cluster-zones/road-section`, "POST", body)

/** Map colours: urban agglomerations blue, rural corridors orange, custom violet; inactive grey. */
export function zoneColor(kind: ZoneKind, environment: Environment, active = true): string {
  if (!active) return "#94a3b8"
  if (kind === "road_section") return environment === "urban" ? "#0ea5e9" : "#f97316"
  if (kind === "custom") return environment === "urban" ? "#8b5cf6" : "#d97706"
  return environment === "urban" ? "#2563eb" : "#ea580c"
}

/** Drop empty / non-positive values; {} → null (inherit). */
export function cleanRadiusMap(m: Record<string, number | string | null | undefined>): RadiusMap | null {
  const out: RadiusMap = {}
  for (const [k, v] of Object.entries(m)) {
    const n = typeof v === "string" ? (v.trim() === "" ? NaN : Number(v)) : v ?? NaN
    if (Number.isFinite(n) && n > 0) out[k] = n
  }
  return Object.keys(out).length ? out : null
}
