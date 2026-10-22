"use client"

import { toast } from "sonner"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import Image from "next/image"
import dynamic from "next/dynamic"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LightboxTrigger } from "@/components/image-lightbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  MapPin, ImageIcon, Eye, Trash2, MessageSquareWarning,
  CheckCircle2, XCircle, Loader2, Ban, ShieldAlert, RotateCcw, Vote,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { RouteSearchBar, type RouteSearchResult } from "@/components/route-search-bar"
import { LOOK_COLOR, markerLook, reportIconUrl } from "@/components/signalement-map"
import { filterAlongRoute, type LatLon } from "@/lib/routes-api"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge, type BadgeTone } from "@/components/status-badge"
import { DataCard, DataToolbar, TOOLBAR_SELECT } from "@/components/data-toolbar"
import { TablePagination } from "@/components/table-pagination"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { useAuth } from "@/components/auth-provider"
import { RequirePermission } from "@/components/require-permission"
import { SettingsLinkButton } from "@/components/settings-index"
import { FlaggedVotersCard, FreshnessBadges, VoteCounts, VotesSheet } from "@/components/signalement-votes"
import {
  fetchSignalements, moderateSignalement, deleteSignalement, resolveMinioUrl,
  type ApiSignalement, type SignalementType, type SignalementStatus,
} from "@/lib/api"

const DEFAULT_PAGE_SIZE = 20
const MAP_LIMIT = 500   // reports of the current filters drawn on the map (table stays paginated)

const SignalementMap = dynamic(() => import("@/components/signalement-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
})

// ── Display helpers ────────────────────────────────────────────────────────────

// API values; display labels come from pmap.sig.type.<value>.
const SIGNALEMENT_TYPES = [
  "embouteillage", "police", "accident", "danger", "route_fermee", "voie_bloquee",
  "probleme_de_carte", "mauvais_temps", "prix_carburant", "assistance_route", "debogage",
  "nid_de_poule", "obstacle", "inondation", "vehicule_panne", "dos_d_ane", "route_glissante",
  "eboulement", "travaux", "animaux", "vehicule_dangereux", "autre",
]

/** "3 minutes ago" in the given locale. */
function relativeTime(date: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const sec = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(sec)
  if (abs < 60) return rtf.format(sec, "second")
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour")
  if (abs < 2592000) return rtf.format(Math.round(sec / 86400), "day")
  if (abs < 31536000) return rtf.format(Math.round(sec / 2592000), "month")
  return rtf.format(Math.round(sec / 31536000), "year")
}

const TYPE_COLORS: Record<string, string> = {
  embouteillage:    "bg-orange-500/10 text-orange-600 border-orange-400/30",
  police:           "bg-blue-500/10 text-blue-600 border-blue-400/30",
  accident:         "bg-red-500/10 text-red-600 border-red-400/30",
  danger:           "bg-yellow-500/10 text-yellow-700 border-yellow-400/30",
  route_fermee:     "bg-rose-500/10 text-rose-600 border-rose-400/30",
  voie_bloquee:     "bg-pink-500/10 text-pink-600 border-pink-400/30",
  probleme_de_carte:"bg-purple-500/10 text-purple-600 border-purple-400/30",
  mauvais_temps:    "bg-sky-500/10 text-sky-600 border-sky-400/30",
  prix_carburant:   "bg-green-500/10 text-green-600 border-green-400/30",
  assistance_route: "bg-teal-500/10 text-teal-600 border-teal-400/30",
  debogage:         "bg-muted text-muted-foreground border-border",
}

const STATUS_TONE: Record<SignalementStatus, BadgeTone> = {
  actif: "green",
  annule: "slate",
  rejete: "red",
}

const STATUS_COLORS: Record<SignalementStatus, string> = {
  actif:  "bg-success/10 text-success border-success/30",
  annule: "bg-warning/10 text-warning border-warning/30",
  rejete: "bg-destructive/10 text-destructive border-destructive/30",
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SignalementsPage() {
  const { t, locale } = useI18n()
  const { can, user } = useAuth()
  const canModerate = can("signalements", "edit")
  const canDelete = can("signalements", "delete")
  const typeLabel = (type: string) => { const k = `pmap.sig.type.${type}`; const s = t(k); return s === k ? type : s }
  const statusLabel = (st: SignalementStatus) => t(`pmap.sig.status.${st}`)
  const fmtDate = (iso: string) => new Date(iso + "Z").toLocaleString(locale, { dateStyle: "medium", timeStyle: "medium" })
  const [items, setItems]       = useState<ApiSignalement[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter,   setTypeFilter]   = useState<string>("all")
  const [search,       setSearch]       = useState("")

  // detail modal
  const [selected, setSelected] = useState<ApiSignalement | null>(null)

  // moderation form
  const [modAction, setModAction]   = useState<"annule" | "rejete" | "actif" | null>(null)
  const [modNote,   setModNote]     = useState("")
  const [modBusy,   setModBusy]     = useState(false)
  const [modError,  setModError]    = useState<string | null>(null)

  // votes drawer
  const [votesFor, setVotesFor] = useState<ApiSignalement | null>(null)

  // map: up to MAP_LIMIT reports of the current filters
  const [mapItems, setMapItems]   = useState<ApiSignalement[]>([])
  const [mapTotal, setMapTotal]   = useState(0)
  const [mapLoading, setMapLoading] = useState(true)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [focus, setFocus]         = useState<{ id: string; n: number } | null>(null)
  const mapBoxRef = useRef<HTMLDivElement>(null)

  // route search: optional "along the route" filter
  const [routeRes, setRouteRes]   = useState<RouteSearchResult | null>(null)
  const [alongOnly, setAlongOnly] = useState(true)

  // delete confirm
  const [toDelete, setToDelete]   = useState<ApiSignalement | null>(null)
  const [delBusy,  setDelBusy]    = useState(false)

  // counts
  const [counts, setCounts] = useState({ actif: 0, annule: 0, rejete: 0 })

  // Deep link ?report=<id> (PDF reports, notifications): open that report's detail.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("report")
    if (!id) return
    fetch(`/api/proxy/signalements/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: ApiSignalement | null) => {
        if (!s) return
        setSelected(s)
        setHighlight(s.id)
        setFocus((f) => ({ id: s.id, n: (f?.n ?? 0) + 1 }))
      })
      .catch(() => {})
  }, [])
  const closeDetail = () => {
    setSelected(null)
    const p = new URLSearchParams(window.location.search)
    if (p.has("report")) {
      p.delete("report")
      const q = p.toString()
      window.history.replaceState(null, "", q ? `${window.location.pathname}?${q}` : window.location.pathname)
    }
  }

  // ── Load counts once / after mutations ─────────────────────────────────────
  async function loadCounts() {
    const [a, b, c] = await Promise.all([
      fetchSignalements({ status: "actif",  limit: 1 }),
      fetchSignalements({ status: "annule", limit: 1 }),
      fetchSignalements({ status: "rejete", limit: 1 }),
    ])
    setCounts({ actif: a.total, annule: b.total, rejete: c.total })
  }

  // ── Load page ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchSignalements({
      status: statusFilter as SignalementStatus | "all",
      type:   typeFilter   as SignalementType   | "all",
      skip:   (page - 1) * pageSize,
      limit:  pageSize,
    })
      .then((d) => { setItems(d.items); setTotal(d.total) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, pageSize, statusFilter, typeFilter])

  useEffect(() => { loadCounts() }, [items])

  // ── Load map items (same filters, not paginated) ───────────────────────────
  useEffect(() => {
    let alive = true
    setMapLoading(true)
    fetchSignalements({
      status: statusFilter as SignalementStatus | "all",
      type:   typeFilter   as SignalementType   | "all",
      skip: 0, limit: MAP_LIMIT,
    })
      .then((d) => { if (alive) { setMapItems(d.items); setMapTotal(d.total) } })
      .catch(() => { if (alive) { setMapItems([]); setMapTotal(0) } })
      .finally(() => { if (alive) setMapLoading(false) })
    return () => { alive = false }
  }, [statusFilter, typeFilter])

  // ── Client-side search filter ───────────────────────────────────────────────
  const matches = useCallback((s: ApiSignalement) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.id.toLowerCase().includes(q) ||
      typeLabel(s.type).toLowerCase().includes(q) ||
      (s.reported_by ?? "").toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, t])

  // "Along the route": the table then lists the matching map items (client-side pages).
  const mainRoute = routeRes?.routes[0]?.geometry ?? null
  const alternatives = useMemo(() => routeRes?.routes.slice(1).map((r) => r.geometry) ?? [], [routeRes])
  const alongActive = !!(mainRoute && alongOnly)
  const mapShown = useMemo(() => {
    const base = mapItems.filter(matches)
    return alongActive
      ? filterAlongRoute(base, mainRoute!, routeRes!.corridorM, (s) => [s.latitude, s.longitude] as LatLon)
      : base
  }, [mapItems, matches, alongActive, mainRoute, routeRes])

  const filtered = useMemo(
    () => (alongActive ? mapShown.slice((page - 1) * pageSize, page * pageSize) : items.filter(matches)),
    [alongActive, mapShown, page, pageSize, items, matches],
  )
  const tableTotal = alongActive ? mapShown.length : total

  const routeLabels = useMemo(() => ({
    start: routeRes?.from.label ?? t("hist.route.from"),
    end: routeRes?.to.label ?? t("hist.route.to"),
  }), [routeRes, t])

  const markerTooltip = useCallback((s: ApiSignalement) => {
    const extra = s.uncertain ? ` · ${t("cm.sig.uncertain")}` : s.expired ? ` · ${t("cm.sig.expired")}` : ""
    return `<b>${typeLabel(s.type)}</b><br/>${statusLabel(s.status)}${extra} · ${relativeTime(new Date(s.reported_at + "Z"), locale)}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, locale])

  // Marker click → highlight + scroll to its row, open the votes drawer.
  const onMarker = useCallback((s: ApiSignalement) => {
    setHighlight(s.id)
    setVotesFor(s)
    window.setTimeout(() => {
      document.getElementById(`sig-row-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 50)
  }, [])

  // Row click → fly the map to the marker.
  const flyTo = (s: ApiSignalement) => {
    setHighlight(s.id)
    setFocus((f) => ({ id: s.id, n: (f?.n ?? 0) + 1 }))
    const box = mapBoxRef.current
    if (box) {
      const r = box.getBoundingClientRect()
      if (r.bottom < 0 || r.top > window.innerHeight) box.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }

  const patchItem = (u: ApiSignalement) => {
    setItems((prev) => prev.map((s) => s.id === u.id ? u : s))
    setMapItems((prev) => prev.map((s) => s.id === u.id ? u : s))
  }

  // ── Moderation submit ───────────────────────────────────────────────────────
  async function handleModerate() {
    if (!selected || !modAction) return
    setModBusy(true)
    setModError(null)
    try {
      const updated = await moderateSignalement(selected.id, modAction, user?.email ?? "admin", modNote || undefined)
      patchItem(updated)
      setSelected(updated)
      setModAction(null)
      setModNote("")
    } catch (e: unknown) {
      setModError(e instanceof Error ? e.message : t("pmap.sig.actionFailed"))
    } finally {
      setModBusy(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!toDelete) return
    setDelBusy(true)
    try {
      await deleteSignalement(toDelete.id)
      setItems((prev) => prev.filter((s) => s.id !== toDelete.id))
      setMapItems((prev) => prev.filter((s) => s.id !== toDelete.id))
      setTotal((n) => n - 1)
      setMapTotal((n) => n - 1)
      if (selected?.id === toDelete.id) setSelected(null)
      setToDelete(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("pmap.sig.deleteFailed"))
    } finally {
      setDelBusy(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="signalements">
        <div className="px-4 py-6 sm:px-6 lg:px-8">

          <PageHeader
            title={t("pmap.sig.title")}
            description={<>{t("pmap.sig.subtitle")}<span className="block text-xs">{t("cm.sig.validatedByVotes")}</span></>}
            actions={<SettingsLinkButton anchor="community" />}
          />

          {/* KPI cards */}
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <StatCard icon={CheckCircle2} tone="green" value={counts.actif} label={t("pmap.sig.kpi.actif")} />
            <StatCard icon={Ban} tone="slate" value={counts.annule} label={t("pmap.sig.kpi.annule")} />
            <StatCard icon={XCircle} tone="red" value={counts.rejete} label={t("pmap.sig.kpi.rejete")} />
          </div>

          {/* Route search — optional "along the route" filter */}
          <div className="relative z-20 mb-4 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <RouteSearchBar
              idPrefix="sig-route"
              active={!!routeRes}
              onResult={(r) => { setRouteRes(r); setAlongOnly(true); setPage(1) }}
              onClear={() => { setRouteRes(null); setPage(1) }}
            />
            {routeRes && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
                <label className="flex items-center gap-2">
                  <Switch checked={alongOnly} onCheckedChange={(v) => { setAlongOnly(v); setPage(1) }} />
                  <span>{t("rt.alongOnly", { m: routeRes.corridorM })}</span>
                </label>
                <span className="text-muted-foreground">
                  {t("rt.sig.alongCount", {
                    n: filterAlongRoute(mapItems.filter(matches), mainRoute!, routeRes.corridorM, (s) => [s.latitude, s.longitude] as LatLon).length,
                    km: ((routeRes.routes[0]?.distance_m ?? 0) / 1000).toFixed(1),
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
          {/* Map — above the table on small screens, at its side on xl */}
          <div ref={mapBoxRef} className="min-w-0 xl:order-last xl:col-span-2">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm xl:sticky xl:top-20">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <h2 className="text-sm font-semibold">{t("rt.sig.mapTitle")}</h2>
                <span className="text-xs text-muted-foreground">
                  {mapLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                    mapTotal > mapItems.length
                      ? t("rt.sig.mapCapped", { shown: mapShown.length, n: MAP_LIMIT, total: mapTotal })
                      : t("rt.sig.mapCount", { shown: mapShown.length })}
                </span>
              </div>
              <div className="relative isolate h-[22rem] w-full sm:h-[26rem] xl:h-[calc(100vh-14rem)] xl:min-h-[26rem]">
                <SignalementMap
                  items={mapShown}
                  selectedId={highlight}
                  focus={focus}
                  onSelect={onMarker}
                  tooltip={markerTooltip}
                  route={mainRoute}
                  alternatives={alternatives}
                  routeLabels={routeLabels}
                />
                {!mapLoading && mapShown.length === 0 && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center px-4">
                    <span className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">
                      {alongActive ? t("rt.sig.noneAlong") : t("pmap.sig.empty")}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[11px] text-muted-foreground">
                {([
                  ["active", "solid", t("pmap.sig.status.actif"), false],
                  ["uncertain", "dashed", t("cm.sig.uncertain"), false],
                  ["annule", "solid", t("pmap.sig.status.annule"), true],
                  ["rejete", "solid", t("pmap.sig.status.rejete"), true],
                ] as const).map(([look, style, label, dim]) => (
                  <span key={look} className="inline-flex items-center gap-1.5">
                    <span
                      className={cn("inline-block h-3.5 w-3.5 rounded-full border-2 bg-background", dim && "opacity-60")}
                      style={{ borderColor: LOOK_COLOR[look], borderStyle: style }}
                    />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 xl:col-span-3">
          <DataCard>
            <DataToolbar search={search} onSearch={setSearch} placeholder={t("pmap.sig.searchPlaceholder")}>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className={TOOLBAR_SELECT}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pmap.sig.allStatus")}</SelectItem>
                  <SelectItem value="actif">{t("pmap.sig.status.actif")}</SelectItem>
                  <SelectItem value="annule">{t("pmap.sig.status.annule")}</SelectItem>
                  <SelectItem value="rejete">{t("pmap.sig.status.rejete")}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
                <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pmap.sig.allTypes")}</SelectItem>
                  {SIGNALEMENT_TYPES.map((k) => (
                    <SelectItem key={k} value={k}>{typeLabel(k)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataToolbar>

            {error && <p className="px-4 pt-3 text-sm text-destructive">{error}</p>}

            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-12 pl-4" />
                  <TableHead>{t("pmap.sig.thType")}</TableHead>
                  <TableHead>{t("pmap.sig.thStatus")}</TableHead>
                  <TableHead>{t("cm.sig.thVotes")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("pmap.sig.thLocation")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("pmap.sig.thReportedBy")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("pmap.sig.thDate")}</TableHead>
                  <TableHead className="pr-4 text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.map((s) => {
                  const img = resolveMinioUrl(s.image_url)
                  return (
                  <TableRow
                    key={s.id}
                    id={`sig-row-${s.id}`}
                    onClick={() => flyTo(s)}
                    aria-selected={highlight === s.id}
                    className={cn("h-11 cursor-pointer scroll-mt-24", highlight === s.id && "bg-primary/10 hover:bg-primary/15")}
                  >
                    <TableCell className="py-1.5 pl-4">
                      {img ? (
                        <LightboxTrigger item={{ src: img, title: typeLabel(s.type) }} className="rounded">
                          <div className="relative h-7 w-10 overflow-hidden rounded bg-black">
                            <Image src={img} alt="" fill className="object-contain" unoptimized />
                          </div>
                        </LightboxTrigger>
                      ) : (
                        <div className="flex h-7 w-10 items-center justify-center rounded bg-muted">
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={reportIconUrl(s.type)} alt="" aria-hidden
                          className={cn("h-6 w-6 shrink-0 rounded-full border-2 bg-background object-contain p-px",
                                        (s.status !== "actif") && "opacity-60 grayscale")}
                          style={{ borderColor: LOOK_COLOR[markerLook(s)], borderStyle: s.uncertain && s.status === "actif" ? "dashed" : "solid" }}
                        />
                        <Badge variant="outline" className={cn("text-xs capitalize", TYPE_COLORS[s.type] ?? "")}>
                          {typeLabel(s.type)}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">{s.id.slice(0, 8)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <StatusBadge tone={STATUS_TONE[s.status]}>{statusLabel(s.status)}</StatusBadge>
                      <FreshnessBadges s={s} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <VoteCounts s={s} />
                    </TableCell>
                    <TableCell className="hidden py-1.5 md:table-cell">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="tabular-nums text-xs">
                          {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-1.5 lg:table-cell">
                      {s.reported_by ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden py-1.5 text-xs text-muted-foreground lg:table-cell">
                      {relativeTime(new Date(s.reported_at + "Z"), locale)}
                    </TableCell>
                    <TableCell className="py-1.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          aria-label={t("pmap.sig.view")} title={t("pmap.sig.view")}
                          onClick={() => { setSelected(s); setModAction(null); setModNote(""); setModError(null) }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          aria-label={t("cm.sig.votesBtn")} title={t("cm.sig.votesBtn")}
                          onClick={() => setVotesFor(s)}
                        >
                          <Vote className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          aria-label={t("pmap.sig.delete")} title={t("pmap.sig.delete")}
                          onClick={() => setToDelete(s)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-28 text-center">
                      <MessageSquareWarning className="mx-auto h-7 w-7 text-muted-foreground/40" />
                      <p className="mt-2 text-sm text-muted-foreground">{t("pmap.sig.empty")}</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <TablePagination
              page={page}
              pageSize={pageSize}
              total={tableTotal}
              onPageChange={setPage}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
            />
          </DataCard>
          </div>
          </div>

          <div className="mt-5">
            <FlaggedVotersCard refreshKey={items} />
          </div>
        </div>
        </RequirePermission>
      </main>

      {/* ── Detail / Moderation Modal ── */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) closeDetail() }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(TYPE_COLORS[selected.type] ?? "")}>
                    {typeLabel(selected.type)}
                  </Badge>
                  <Badge variant="outline" className={STATUS_COLORS[selected.status]}>
                    {statusLabel(selected.status)}
                  </Badge>
                </DialogTitle>
                <DialogDescription>{t("pmap.sig.idLine", { id: selected.id.slice(0, 8) })}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">

                {/* Image */}
                {resolveMinioUrl(selected.image_url) ? (
                  <LightboxTrigger item={{ src: resolveMinioUrl(selected.image_url), title: typeLabel(selected.type) }} className="w-full rounded-lg">
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
                      <Image
                        src={resolveMinioUrl(selected.image_url)!}
                        alt="signalement"
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  </LightboxTrigger>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                    <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                )}

                {/* Info grid */}
                <div className="grid gap-3 sm:grid-cols-2 text-sm rounded-lg border p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("pmap.sig.thLocation")}</p>
                    <p className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("pmap.sig.thReportedBy")}</p>
                    <p>{selected.reported_by ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("pmap.sig.thDate")}</p>
                    <p>{fmtDate(selected.reported_at)}</p>
                  </div>
                  {selected.description && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">{t("pmap.sig.description")}</p>
                      <p className="italic">{selected.description}</p>
                    </div>
                  )}
                </div>

                {/* Community votes */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <VoteCounts s={selected} />
                    <FreshnessBadges s={selected} />
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setVotesFor(selected)}>
                    <Vote className="h-4 w-4" /> {t("cm.sig.votesBtn")}
                  </Button>
                </div>
                {selected.expires_at && (
                  <p className="text-xs text-muted-foreground">
                    {t("cm.sig.visibleUntil")} {fmtDate(selected.expires_at.replace(/Z$/, ""))}
                  </p>
                )}

                {/* Moderation info (already moderated) */}
                {selected.moderated_at && (
                  <div className="rounded-lg border p-4 space-y-1 text-sm">
                    <p className="font-medium flex items-center gap-1">
                      <ShieldAlert className="h-4 w-4" /> {t("pmap.sig.moderation")}
                    </p>
                    <p>
                      {t("pmap.sig.by")} <span className="font-medium">{selected.moderated_by}</span>
                      {" · "}
                      {fmtDate(selected.moderated_at)}
                    </p>
                    {selected.moderation_note && (
                      <p className="text-muted-foreground italic">"{selected.moderation_note}"</p>
                    )}
                  </div>
                )}

                {/* Moderation actions — only when actif */}
                {selected.status === "actif" && canModerate && (
                  <div className="border-t pt-4 space-y-3">
                    {modAction === null ? (
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          className="flex-1 text-warning border-warning/30 hover:bg-warning/10"
                          onClick={() => setModAction("annule")}
                        >
                          <Ban className="mr-2 h-4 w-4" /> {t("pmap.sig.cancelReport")}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setModAction("rejete")}
                        >
                          <XCircle className="mr-2 h-4 w-4" /> {t("pmap.sig.reject")}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">
                          {modAction === "annule" ? t("pmap.sig.cancelThis") : t("pmap.sig.rejectThis")}
                        </p>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("pmap.sig.noteOptional")}</Label>
                          <Textarea
                            placeholder={t("pmap.sig.notePlaceholder")}
                            value={modNote}
                            onChange={(e) => setModNote(e.target.value)}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        {modError && <p className="text-xs text-destructive">{modError}</p>}
                        <div className="flex gap-3">
                          <Button
                            className={cn(
                              "flex-1",
                              modAction === "annule"
                                ? "bg-warning hover:bg-warning/90 text-warning-foreground"
                                : "bg-destructive hover:bg-destructive/90 text-white"
                            )}
                            disabled={modBusy}
                            onClick={handleModerate}
                          >
                            {modBusy
                              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              : modAction === "annule"
                                ? <Ban className="mr-2 h-4 w-4" />
                                : <XCircle className="mr-2 h-4 w-4" />
                            }
                            {t("pmap.sig.confirm")}
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={() => { setModAction(null); setModNote(""); setModError(null) }}>
                            {t("pmap.sig.back")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Restore a hidden / rejected report */}
                {selected.status !== "actif" && canModerate && (
                  <div className="border-t pt-4 space-y-3">
                    {modAction !== "actif" ? (
                      <Button variant="outline" className="w-full gap-2" onClick={() => setModAction("actif")}>
                        <RotateCcw className="h-4 w-4" /> {t("cm.sig.restore")}
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium">{t("cm.sig.restoreThis")}</p>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("pmap.sig.noteOptional")}</Label>
                          <Textarea value={modNote} onChange={(e) => setModNote(e.target.value)} rows={2} className="text-sm" />
                        </div>
                        {modError && <p className="text-xs text-destructive">{modError}</p>}
                        <div className="flex gap-3">
                          <Button className="flex-1 gap-2" disabled={modBusy} onClick={handleModerate}>
                            {modBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            {t("pmap.sig.confirm")}
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={() => { setModAction(null); setModNote(""); setModError(null) }}>
                            {t("pmap.sig.back")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Delete button (needs signalements:delete) */}
                {canDelete && (
                <div className="flex justify-end border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 gap-1.5"
                    onClick={() => { setToDelete(selected); setSelected(null) }}
                  >
                    <Trash2 className="h-4 w-4" /> {t("pmap.sig.delete")}
                  </Button>
                </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Votes drawer ── */}
      <VotesSheet signalement={votesFor} onClose={() => setVotesFor(null)} />

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pmap.sig.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pmap.sig.deleteDesc", { id: toDelete?.id.slice(0, 8) ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={delBusy}
              onClick={handleDelete}
            >
              {delBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("pmap.sig.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
