"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import {
  Search,
  Mic,
  Clock,
  X,
  ArrowLeft,
  MapPin,
  ChevronRight,
  Navigation,
} from "lucide-react"
import {
  getRecentDestinations,
  saveDestination,
  type Destination,
} from "@/lib/recent-destinations"
import type { LatLng } from "@/components/navigation-map"
import { useT } from "@/lib/i18n"
import { fetchRoutePreview, reversePlace, searchPlaces as apiSearchPlaces } from "@/lib/routes-api"
import { RequirePermission } from "@/components/require-permission"

function NavMapLoading() {
  const t = useT()
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <div className="flex flex-col items-center gap-2">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-gray-500">{t("pmap.navmap.loading")}</p>
      </div>
    </div>
  )
}

// ─── Dynamic map import (no SSR) ─────────────────────────────────────────────
const NavigationMap = dynamic(() => import("@/components/navigation-map"), {
  ssr: false,
  loading: () => <NavMapLoading />,
})

// ─── Geocoding helpers ───────────────────────────────────────────────
interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address?: {
    city?: string
    town?: string
    state?: string
    country?: string
  }
}

// Through the platform API (server-side geocoder) — the browser never calls Nominatim itself.
async function searchPlaces(query: string): Promise<NominatimResult[]> {
  if (!query.trim()) return []
  const places = await apiSearchPlaces(query, "en")
  return places.map((p, i) => ({
    place_id: i,
    display_name: [p.label, p.secondary].filter(Boolean).join(", "),
    lat: String(p.lat),
    lon: String(p.lon),
  }))
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const p = await reversePlace(lat, lng, "en")
  return [p.label, p.secondary].filter(Boolean).join(", ")
}

// Shorten a long Nominatim display_name to "Name, City, Region"
function shortName(display_name: string): string {
  const parts = display_name.split(", ")
  if (parts.length <= 3) return display_name
  return parts.slice(0, 3).join(", ")
}

function subLabel(result: NominatimResult): string {
  const a = result.address
  if (!a) return shortName(result.display_name).split(", ").slice(1).join(", ")
  return [a.city ?? a.town, a.state, a.country].filter(Boolean).join(", ")
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NavigateMapPage() {
  return (
    <RequirePermission module="navigate">
      <NavigateMap />
    </RequirePermission>
  )
}

function NavigateMap() {
  const t = useT()
  // Location & destination state
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [destination, setDestination] = useState<LatLng | null>(null)
  const [routePoints, setRoutePoints] = useState<LatLng[]>([])

  // Bottom sheet state
  const [sheetOpen, setSheetOpen] = useState(false)     // "Where to?" panel expanded
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)

  // Recent destinations (from localStorage)
  const [recent, setRecent] = useState<Destination[]>([])

  // Active destination label (shown on map)
  const [destLabel, setDestLabel] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load recent destinations on mount ──
  useEffect(() => {
    setRecent(getRecentDestinations())
  }, [])

  // ── Get user location ──
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => { /* no location */ },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [])

  // ── Debounced search ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const res = await searchPlaces(query)
      setResults(res)
      setSearching(false)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // ── Open the "Where to?" sheet ──
  const openSheet = useCallback(() => {
    setSheetOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 150)
  }, [])

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setQuery("")
    setResults([])
  }, [])

  // ── Select a destination ──
  const selectDestination = useCallback(
    async (lat: number, lng: number, name: string, address: string) => {
      const dest: LatLng = { lat, lng }
      setDestination(dest)
      setDestLabel(name)

      // Route through the platform's own OSRM server (API /routes/preview)
      if (userLocation) {
        try {
          const [route] = await fetchRoutePreview([userLocation.lat, userLocation.lng], [lat, lng], false)
          setRoutePoints(route.geometry.map(([la, lo]) => ({ lat: la, lng: lo })))
        } catch {
          setRoutePoints([])
        }
      }

      // Save to recent
      const saved = saveDestination({ name, address, lat, lng })
      setRecent((prev) => {
        const filtered = prev.filter((d) => d.id !== saved.id)
        return [saved, ...filtered].slice(0, 8)
      })

      closeSheet()
    },
    [userLocation, closeSheet]
  )

  // ── Handle a search result click ──
  const handleResultClick = useCallback(
    (result: NominatimResult) => {
      const name = shortName(result.display_name).split(", ")[0]
      const address = subLabel(result)
      selectDestination(
        parseFloat(result.lat),
        parseFloat(result.lon),
        name,
        address
      )
    },
    [selectDestination]
  )

  // ── Handle a recent destination click ──
  const handleRecentClick = useCallback(
    (dest: Destination) => {
      selectDestination(dest.lat, dest.lng, dest.name, dest.address)
    },
    [selectDestination]
  )

  // ── Clear active route ──
  const clearRoute = useCallback(() => {
    setDestination(null)
    setRoutePoints([])
    setDestLabel(null)
  }, [])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gray-100 select-none">
      {/* ── Full-screen map ────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        <NavigationMap
          userLocation={userLocation}
          destination={destination}
          routePoints={routePoints}
        />
      </div>

      {/* ── Active route banner ────────────────────────────── */}
      {destLabel && !sheetOpen && (
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-2 rounded-2xl bg-white shadow-lg px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
            <MapPin className="h-4 w-4 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{destLabel}</p>
            <p className="text-xs text-gray-400">{t("pmap.navmap.routeActive")}</p>
          </div>
          <button onClick={clearRoute} aria-label={t("pmap.navmap.clearRoute")} className="h-7 w-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      )}

      {/* ── Bottom sheet ───────────────────────────────────── */}
      <div
        className={`
          absolute left-0 right-0 bottom-0 z-10
          transition-all duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]
          ${sheetOpen ? "top-0" : "top-[55%]"}
        `}
      >
        {/* Sheet card */}
        <div className="h-full flex flex-col bg-white rounded-t-3xl shadow-2xl overflow-hidden">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>

          {/* ── Collapsed view: "Where to?" bar ── */}
          {!sheetOpen && (
            <div className="px-4 pt-2 pb-4 flex flex-col gap-4">
              {/* Where to bar */}
              <button
                onClick={openSheet}
                className="flex items-center gap-3 w-full rounded-2xl bg-gray-100 px-4 py-3.5 text-left"
              >
                <Search className="h-5 w-5 text-gray-400 shrink-0" />
                <span className="flex-1 text-gray-400 text-sm font-medium">{t("pmap.navmap.whereTo")}</span>
                <Mic className="h-5 w-5 text-primary shrink-0" />
              </button>

              {/* Recent destinations */}
              {recent.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                    {t("pmap.navmap.recent")}
                  </p>
                  <div className="space-y-0.5">
                    {recent.slice(0, 4).map((dest) => (
                      <button
                        key={dest.id}
                        onClick={() => handleRecentClick(dest)}
                        className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
                          <Clock className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{dest.name}</p>
                          <p className="text-xs text-gray-400 truncate">{dest.address}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Expanded view: search + results ── */}
          {sheetOpen && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Search header */}
              <div className="px-4 pt-2 pb-3 shrink-0 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <button onClick={closeSheet} aria-label={t("pmap.navmap.back")} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <div className="flex-1 flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-2.5">
                    <Search className="h-4 w-4 text-gray-400 shrink-0" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder={t("pmap.navmap.searchPlaceholder")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 text-gray-800"
                    />
                    {query && (
                      <button onClick={() => setQuery("")} aria-label={t("pmap.navmap.clearSearch")}>
                        <X className="h-4 w-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <Mic className="h-5 w-5 text-primary shrink-0" />
                </div>
              </div>

              {/* Results / recent list — scrollable */}
              <div className="flex-1 overflow-y-auto px-4">

                {/* Search results */}
                {query.trim() ? (
                  <>
                    {searching && (
                      <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                        <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-primary animate-spin" />
                        {t("pmap.navmap.searching")}
                      </div>
                    )}
                    {!searching && results.length === 0 && query.trim() && (
                      <p className="py-6 text-center text-sm text-gray-400">{t("pmap.navmap.noResults", { query })}</p>
                    )}
                    {results.map((r) => (
                      <button
                        key={r.place_id}
                        onClick={() => handleResultClick(r)}
                        className="w-full flex items-center gap-3 py-3 border-b border-gray-100 text-left hover:bg-gray-50 rounded-xl px-1 transition-colors last:border-0"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <MapPin className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {shortName(r.display_name).split(", ")[0]}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{subLabel(r)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                      </button>
                    ))}
                  </>
                ) : (
                  /* Recent destinations list */
                  <>
                    {recent.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2">
                          {t("pmap.navmap.recent")}
                        </p>
                        {recent.map((dest) => (
                          <button
                            key={dest.id}
                            onClick={() => handleRecentClick(dest)}
                            className="w-full flex items-center gap-3 py-3 border-b border-gray-100 text-left hover:bg-gray-50 rounded-xl px-1 transition-colors last:border-0"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
                              <Clock className="h-5 w-5 text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{dest.name}</p>
                              <p className="text-xs text-gray-400 truncate">{dest.address}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                          </button>
                        ))}
                      </>
                    )}
                    {recent.length === 0 && (
                      <div className="flex flex-col items-center gap-2 py-12 text-center">
                        <Navigation className="h-10 w-10 text-gray-200" />
                        <p className="text-sm text-gray-400">{t("pmap.navmap.noRecent")}</p>
                        <p className="text-xs text-gray-300">{t("pmap.navmap.searchHint")}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
