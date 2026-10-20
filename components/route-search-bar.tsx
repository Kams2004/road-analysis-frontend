"use client"

/**
 * Compact route search: predefined road section (tronçon) select, Départ and
 * Destination with place autocomplete, swap, "Search" and "Clear". Fetches
 * the OSRM route (GET /routes/preview) and hands it to the page, which then
 * shows only what lies along it (within `corridorM`, Settings → Mobile app →
 * route corridor).
 */
import { useEffect, useState } from "react"
import { ArrowLeftRight, Loader2, Route, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlaceAutocomplete } from "@/components/place-autocomplete"
import { useI18n } from "@/lib/i18n"
import {
  fetchRoutePreview, getRouteSections,
  type Place, type RoutePreview, type RouteSection, type ViewBox,
} from "@/lib/routes-api"
import { cn } from "@/lib/utils"

export interface RouteSearchResult {
  from: Place
  to: Place
  routes: RoutePreview[]          // first = recommended, then alternatives
  corridorM: number
  sectionId: string | null
}

const DEFAULT_CORRIDOR_M = 60
const NONE = "__none__"

/** Predefined road sections + corridor width (GET /routes/sections, cached). */
export function useRouteSections() {
  const [sections, setSections] = useState<RouteSection[]>([])
  const [corridorM, setCorridorM] = useState(DEFAULT_CORRIDOR_M)
  useEffect(() => {
    let alive = true
    getRouteSections()
      .then((d) => { if (alive) { setSections(d.sections); setCorridorM(d.corridor_m || DEFAULT_CORRIDOR_M) } })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  return { sections, corridorM }
}

export const sectionPlaces = (s: RouteSection): [Place, Place] => [
  { label: s.from.label || s.name, lat: s.from.lat, lon: s.from.lon },
  { label: s.to.label || s.name, lat: s.to.lat, lon: s.to.lon },
]

/** "Tronçon" select — picking one fills Départ and Destination. */
export function RouteSectionSelect({
  sections, value, onPick, className, compact,
}: {
  sections: RouteSection[]
  value: string | null
  onPick: (s: RouteSection | null) => void
  className?: string
  compact?: boolean
}) {
  const { t } = useI18n()
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onPick(v === NONE ? null : sections.find((s) => s.id === v) ?? null)}
      disabled={sections.length === 0}
    >
      <SelectTrigger
        size={compact ? "sm" : "default"}
        className={cn(compact ? "h-8 text-xs" : "h-9", "w-full", className)}
        aria-label={t("rt.section")}
      >
        <Route className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={t("rt.sectionPh")} />
      </SelectTrigger>
      <SelectContent className="z-[9999]">
        <SelectItem value={NONE}>{t("rt.sectionNone")}</SelectItem>
        {sections.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function RouteSearchBar({
  onResult, onClear, active, viewbox, className, idPrefix = "rs",
}: {
  onResult: (r: RouteSearchResult) => void
  onClear: () => void
  /** A route is currently applied (shows "Clear"). */
  active: boolean
  viewbox?: ViewBox | null
  className?: string
  idPrefix?: string
}) {
  const { t } = useI18n()
  const { sections, corridorM } = useRouteSections()
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (a = from, b = to, sid = sectionId) => {
    if (!a || !b) { setError(t("hist.route.pickBoth")); return }
    setLoading(true)
    setError(null)
    try {
      const routes = await fetchRoutePreview([a.lat, a.lon], [b.lat, b.lon])
      onResult({ from: a, to: b, routes, corridorM, sectionId: sid })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg === "no_route" ? t("rt.noRoute") : `${t("rt.failed")} (${msg})`)
    } finally {
      setLoading(false)
    }
  }

  const pickSection = (s: RouteSection | null) => {
    setSectionId(s?.id ?? null)
    if (!s) return
    const [a, b] = sectionPlaces(s)
    setFrom(a)
    setTo(b)
    run(a, b, s.id)
  }

  const clear = () => {
    setFrom(null)
    setTo(null)
    setSectionId(null)
    setError(null)
    onClear()
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); run() }}
      className={cn("flex flex-wrap items-start gap-2", className)}
      aria-label={t("rt.title")}
    >
      <RouteSectionSelect sections={sections} value={sectionId} onPick={pickSection} compact className="sm:w-52" />
      <PlaceAutocomplete
        id={`${idPrefix}-from`} compact value={from} viewbox={viewbox}
        onChange={(p) => { setFrom(p); setSectionId(null) }}
        placeholder={t("rt.fromPh")} className="min-w-[11rem] flex-1"
      />
      <Button
        type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
        title={t("rt.swap")} aria-label={t("rt.swap")}
        onClick={() => { setFrom(to); setTo(from) }}
      >
        <ArrowLeftRight className="h-4 w-4" />
      </Button>
      <PlaceAutocomplete
        id={`${idPrefix}-to`} compact value={to} viewbox={viewbox}
        onChange={(p) => { setTo(p); setSectionId(null) }}
        placeholder={t("rt.toPh")} className="min-w-[11rem] flex-1"
      />
      <Button type="submit" size="sm" className="h-8 gap-1.5" disabled={loading || !from || !to}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {t("hist.route.search")}
      </Button>
      {(active || from || to) && (
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={clear}>
          <X className="h-4 w-4" /> {t("rt.clear")}
        </Button>
      )}
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  )
}
