"use client"

/**
 * Building blocks of the Hazard Track explorer (components/hazard-track/*):
 * hazard-type colours and icons, readable places (street · quartier, town)
 * from the structured reverse-geocoded address, coordinates with a copy
 * button, the cluster-zone badge and small hooks.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Car, CircleDot, Copy, MapPin, Signpost, TriangleAlert, Waves } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// ── hazard types ─────────────────────────────────────────────────────────────

export interface TypeMeta {
  /** Map colour (hex). */
  color: string
  Icon: LucideIcon
  /** Tinted icon tile. */
  tile: string
  /** Left accent of cards. */
  accent: string
}

const TYPE_META: Record<string, TypeMeta> = {
  pothole: {
    color: "#ef4444", Icon: CircleDot,
    tile: "bg-red-500/10 text-red-600 ring-red-500/25 dark:text-red-400", accent: "before:bg-red-500",
  },
  traffic_sign: {
    color: "#3b82f6", Icon: Signpost,
    tile: "bg-blue-500/10 text-blue-600 ring-blue-500/25 dark:text-blue-400", accent: "before:bg-blue-500",
  },
  speed_bump: {
    color: "#f59e0b", Icon: Waves,
    tile: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-400", accent: "before:bg-amber-500",
  },
  parked_vehicle: {
    color: "#0ea5e9", Icon: Car,
    tile: "bg-sky-500/10 text-sky-600 ring-sky-500/25 dark:text-sky-400", accent: "before:bg-sky-500",
  },
}
const DEFAULT_META: TypeMeta = {
  color: "#8b5cf6", Icon: TriangleAlert,
  tile: "bg-violet-500/10 text-violet-600 ring-violet-500/25 dark:text-violet-400", accent: "before:bg-violet-500",
}

export const typeMeta = (type: string | null | undefined): TypeMeta => (type && TYPE_META[type]) || DEFAULT_META

export function TypeTile({ type, size = "md", className }: { type: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const m = typeMeta(type)
  const box = size === "sm" ? "h-7 w-7 rounded-md" : size === "lg" ? "h-11 w-11 rounded-xl" : "h-9 w-9 rounded-lg"
  const icon = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4"
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center ring-1 ring-inset", box, m.tile, className)}>
      <m.Icon className={icon} />
    </span>
  )
}

// ── readable places ──────────────────────────────────────────────────────────

export interface Addressed {
  road?: string | null
  locality?: string | null
  district?: string | null
  town?: string | null
  region?: string | null
  display_location?: string | null
  location_name?: string | null
  city?: string | null
  country?: string | null
}

/**
 * "Rue Joss · Akwa" + "Douala" from the structured address; older records
 * fall back on display_location / location_name / city, country. `null`
 * primary = no readable place yet (show coordinates).
 */
export function placeParts(a: Addressed): { primary: string | null; secondary: string | null } {
  const town = a.town ?? a.city ?? null
  const local = [a.road, a.locality].filter(Boolean) as string[]
  if (local.length) {
    const sec = [town, !town ? a.district : null, !town ? a.region : null].filter(Boolean)
    return { primary: local.join(" · "), secondary: sec.length ? sec.join(", ") : null }
  }
  if (town) {
    const sec = [a.district && a.district !== town ? a.district : null, a.region].filter(Boolean)
    return { primary: town, secondary: sec.length ? sec.join(", ") : null }
  }
  const legacy = a.display_location ?? a.location_name
  if (legacy) return { primary: legacy, secondary: a.location_name && a.display_location ? null : (a.country ?? null) }
  const cc = [a.city, a.country].filter(Boolean).join(", ")
  return { primary: cc || null, secondary: null }
}

/** One-line readable place ("Rue Joss · Akwa, Douala") or null. */
export function placeLabel(a: Addressed): string | null {
  const { primary, secondary } = placeParts(a)
  return primary ? [primary, secondary].filter(Boolean).join(", ") : null
}

export function fmtCoords(lat: number, lon: number, digits = 5) {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`
}

/** Small monospace coordinates with a copy button (secondary information). */
export function CoordsCopy({ lat, lon, className }: { lat: number | null | undefined; lon: number | null | undefined; className?: string }) {
  const t = useT()
  if (lat == null || lon == null) return null
  const text = fmtCoords(lat, lon, 6)
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("ht.coords.copied"))
    } catch {
      toast.error(text)
    }
  }
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground", className)}>
      {text}
      <button type="button" onClick={copy} title={t("ht.coords.copy")} aria-label={t("ht.coords.copy")}
        className="rounded p-0.5 hover:bg-muted hover:text-foreground">
        <Copy className="h-3 w-3" />
      </button>
    </span>
  )
}

/** Readable place with a pin icon; coordinates only as small secondary text. */
export function PlaceBlock({ a, lat, lon, showCoords = true, size = "md", className }: {
  a: Addressed
  lat?: number | null
  lon?: number | null
  showCoords?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const t = useT()
  const { primary, secondary } = placeParts(a)
  return (
    <div className={cn("min-w-0", className)}>
      <p className={cn("flex min-w-0 items-start gap-1.5", size === "lg" ? "text-base font-semibold" : size === "sm" ? "text-xs font-medium" : "text-sm font-medium")}>
        <MapPin className={cn("mt-0.5 shrink-0 text-muted-foreground", size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5")} />
        <span className={cn("min-w-0", size !== "lg" && "truncate")}>
          {primary ?? <span className="font-normal italic text-muted-foreground">{t("ht.place.unknown")}</span>}
        </span>
      </p>
      {secondary && <p className={cn("truncate pl-5 text-muted-foreground", size === "lg" ? "text-sm" : "text-xs")}>{secondary}</p>}
      {showCoords && <CoordsCopy lat={lat} lon={lon} className="pl-5" />}
    </div>
  )
}

// ── cluster zone ─────────────────────────────────────────────────────────────

/** "Douala · urban · 25 m" when the cluster configuration recorded a zone/environment. */
export function ZoneBadge({ h, className }: {
  h: { cluster_zone_name?: string | null; cluster_environment?: string | null; radius_m?: number | null }
  className?: string
}) {
  const t = useT()
  if (!h.cluster_zone_name && !h.cluster_environment) return null
  const tl = (k: string, raw: string) => { const s = t(k); return s === k ? raw : s }
  const parts = [
    h.cluster_zone_name,
    h.cluster_environment ? tl(`ht.zone.${h.cluster_environment}`, h.cluster_environment) : null,
    h.radius_m != null ? `${Math.round(h.radius_m)} m` : null,
  ].filter(Boolean)
  return (
    <span title={t("ht.zone.title")} className={cn(
      "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border",
      className,
    )}>
      {parts.join(" · ")}
    </span>
  )
}

// ── hooks ────────────────────────────────────────────────────────────────────

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

/** True below Tailwind's `lg` breakpoint (stacked navigation). */
export function useIsNarrow(query = "(max-width: 1023px)") {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [query])
  return narrow
}
