"use client"

/**
 * Base-map tiles for the signed-in user (GET /map-config): OpenStreetMap by
 * default, Google Maps when the user's preference (or the platform default)
 * says so and an administrator has configured a key. Fetched once per page
 * load and shared by every map component.
 *
 *   const tiles = useMapTiles()
 *   L.tileLayer(tiles.url, { subdomains: tiles.subdomains, attribution: tiles.attribution, maxZoom: tiles.maxZoom })
 */
import { useEffect, useState } from "react"
import { getMapConfig, type MapConfig } from "@/lib/auth-api"

export interface LeafletTiles {
  provider: "osm" | "google"
  url: string
  subdomains: string[]
  attribution: string
  maxZoom: number
  /** Set when Google was requested but OSM is shown instead. */
  fallbackReason: string | null
  loaded: boolean
}

const OSM_FALLBACK: LeafletTiles = {
  provider: "osm",
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  subdomains: ["a", "b", "c"],
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
  fallbackReason: null,
  loaded: false,
}

let cached: Promise<MapConfig> | null = null

/** Convert the backend's expanded URL list back into a Leaflet template. */
export function toLeaflet(cfg: MapConfig): LeafletTiles {
  const urls = cfg.tile_urls
  let url = urls[0] ?? OSM_FALLBACK.url
  let subdomains: string[] = []
  if (urls.length > 1) {
    // e.g. https://a.tile…, https://b.tile… → https://{s}.tile… with [a, b]
    const first = urls[0]
    const m = first.match(/^(https?:\/\/)([^.]+)\.(.*)$/)
    if (m && urls.every((u) => u.startsWith(m[1]) && u.endsWith(`.${m[3]}`))) {
      url = `${m[1]}{s}.${m[3]}`
      subdomains = urls.map((u) => u.slice(m[1].length).split(".")[0])
    }
  }
  return {
    provider: cfg.provider,
    url,
    subdomains,
    attribution: cfg.attribution,
    maxZoom: cfg.max_zoom,
    fallbackReason: cfg.fallback_reason,
    loaded: true,
  }
}

export function useMapTiles(): LeafletTiles {
  const [tiles, setTiles] = useState<LeafletTiles>(OSM_FALLBACK)
  useEffect(() => {
    let alive = true
    cached = cached ?? getMapConfig()
    cached
      .then((cfg) => alive && setTiles(toLeaflet(cfg)))
      .catch(() => { cached = null; if (alive) setTiles({ ...OSM_FALLBACK, loaded: true }) })
    return () => { alive = false }
  }, [])
  return tiles
}

/** Call after the user changes their map preference. */
export function invalidateMapTiles() {
  cached = null
}
