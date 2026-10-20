"use client"

/**
 * Zones of the Cluster configuration: list (search, kind filter, active
 * toggle, radius summary) and the add / edit flows — agglomeration from an
 * OpenStreetMap boundary, road section from a tronçon / two places (OSRM),
 * hand-drawn polygon. The map stays visible: previews and drawing go
 * through `ctl`.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ArrowLeft, Building2, Loader2, MapPinned, Pencil, PenTool, Route, Search, Trash2, Undo2, X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PlaceAutocomplete } from "@/components/place-autocomplete"
import { errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import { getRouteSections, type Place, type RouteSection } from "@/lib/routes-api"
import {
  createRoadSection, createZone, deleteZone, getZone, searchBoundaries, updateZone, zoneColor,
  type BoundaryCandidate, type ClusterZone, type ClusteringConfig, type Environment, type Geometry,
  type RoadSectionOut, type ZoneKind,
} from "@/lib/clustering-api"
import { ZoneForm, type ZoneFormValues } from "./zone-form"
import { geometryBounds, type Bounds, type LatLon, type MapMode } from "./zones-map"

export interface MapCtl {
  setPreview: (g: Geometry[] | null, env?: Environment) => void
  drawing: LatLon[] | null
  setDrawing: (pts: LatLon[] | null) => void
  setMode: (m: MapMode) => void
  fitTo: (b: Bounds | null) => void
}

type View =
  | { v: "list" }
  | { v: "agglo" }
  | { v: "road" }
  | { v: "draw" }
  | { v: "edit"; zone: ClusterZone; redraw: boolean }

const bboxBounds = (b: [number, number, number, number] | null | undefined): Bounds | null =>
  b ? [[b[0], b[1]], [b[2], b[3]]] : null

const ringToGeometry = (pts: LatLon[]): Geometry => {
  const ring = pts.map(([lat, lon]) => [lon, lat])
  ring.push(ring[0])
  return { type: "Polygon", coordinates: [ring] }
}

const outerRing = (g: Geometry | null): LatLon[] | null => {
  if (!g) return null
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null
  if (!ring) return null
  const pts = (ring as number[][]).map(([lon, lat]) => [lat, lon] as LatLon)
  return pts.length > 1 ? pts.slice(0, -1) : pts
}

export function ZonesPanel({
  zones, config, readOnly, selectedId, hoveredId, onSelect, onHover, ctl, onChanged,
}: {
  zones: ClusterZone[]
  config: ClusteringConfig
  readOnly: boolean
  selectedId: number | null
  hoveredId: number | null
  onSelect: (id: number | null) => void
  onHover: (id: number | null) => void
  ctl: MapCtl
  onChanged: () => void
}) {
  const t = useT()
  const [view, setView] = useState<View>({ v: "list" })
  const [q, setQ] = useState("")
  const [kind, setKind] = useState<"all" | ZoneKind>("all")
  const [toDelete, setToDelete] = useState<ClusterZone | null>(null)
  const [saving, setSaving] = useState(false)

  const back = () => {
    ctl.setPreview(null)
    ctl.setDrawing(null)
    ctl.setMode("select")
    setView({ v: "list" })
  }

  const filtered = useMemo(() => zones.filter((z) =>
    (kind === "all" || z.kind === kind) && (!q.trim() || z.name.toLowerCase().includes(q.trim().toLowerCase()))), [zones, q, kind])

  const kindIcon = (k: ZoneKind) => (k === "agglomeration" ? Building2 : k === "road_section" ? Route : PenTool)

  const summary = (z: ClusterZone) => {
    const n = Object.keys(z.type_radius ?? {}).length + Object.keys(z.signalement_radius ?? {}).length
    const base = z.default_radius_m != null
      ? t("cl.sum.default", { v: z.default_radius_m })
      : t("cl.sum.inherit", { env: t(`cl.env.${z.environment}`), v: config[z.environment].default_radius_m })
    return [base, n ? t("cl.sum.overrides", { n }) : null,
      z.corridor_width_m ? t("cl.sum.corridor", { w: z.corridor_width_m }) : null].filter(Boolean).join(" · ")
  }

  const toggleActive = async (z: ClusterZone, is_active: boolean) => {
    try {
      await updateZone(z.id, { is_active })
      onChanged()
    } catch (e) { toast.error(errorText(t, e, "cl")) }
  }

  const doDelete = async () => {
    if (!toDelete) return
    try {
      await deleteZone(toDelete.id)
      toast.success(t("cl.deleted"))
      if (selectedId === toDelete.id) onSelect(null)
      onChanged()
    } catch (e) { toast.error(errorText(t, e, "cl")) }
    setToDelete(null)
  }

  const openEdit = async (z: ClusterZone) => {
    try {
      const full = await getZone(z.id)
      onSelect(z.id)
      ctl.fitTo(bboxBounds(full.bbox))
      setView({ v: "edit", zone: full, redraw: false })
    } catch (e) { toast.error(errorText(t, e, "cl")) }
  }

  const saved = () => {
    toast.success(t("cl.form.saved"))
    onChanged()
    back()
  }

  // ── sub views ──
  if (view.v === "agglo") {
    return <AggloFlow config={config} ctl={ctl} onBack={back} onSaved={saved} saving={saving} setSaving={setSaving} />
  }
  if (view.v === "road") {
    return <RoadFlow config={config} ctl={ctl} onBack={back} onSaved={saved} saving={saving} setSaving={setSaving} />
  }
  if (view.v === "draw" || (view.v === "edit")) {
    const editing = view.v === "edit" ? view.zone : null
    const drawingActive = view.v === "draw" || (view.v === "edit" && view.redraw)
    const pts = ctl.drawing ?? []
    const submit = async (v: ZoneFormValues) => {
      setSaving(true)
      try {
        if (editing) {
          await updateZone(editing.id, { ...v, ...(drawingActive ? { geometry: ringToGeometry(pts) } : {}) })
        } else {
          await createZone({ ...v, kind: "custom", geometry: ringToGeometry(pts), source: "drawn" })
        }
        saved()
      } catch (e) { toast.error(errorText(t, e, "cl")) } finally { setSaving(false) }
    }
    return (
      <div className="space-y-3">
        <FlowHeader title={editing ? t("cl.form.editTitle") : t("cl.draw.title")} onBack={back}
          sub={editing ? editing.name : undefined} />
        {editing && editing.kind !== "road_section" && !readOnly && !drawingActive && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
            ctl.setDrawing(outerRing(editing.geometry))
            ctl.setMode("draw")
            setView({ ...view, redraw: true } as View)
          }}>
            <PenTool className="mr-1 h-3.5 w-3.5" />{t("cl.draw.redraw")}
          </Button>
        )}
        {drawingActive && (
          <div className="space-y-2 rounded-md border border-violet-500/30 bg-violet-500/5 p-2.5">
            <p className="text-[11px] text-muted-foreground">{t("cl.draw.hint")}</p>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[11px]">{t("cl.draw.points", { n: pts.length })}</Badge>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!pts.length}
                  onClick={() => ctl.setDrawing(pts.slice(0, -1))}><Undo2 className="mr-1 h-3.5 w-3.5" />{t("cl.draw.undo")}</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!pts.length}
                  onClick={() => ctl.setDrawing([])}><X className="mr-1 h-3.5 w-3.5" />{t("cl.draw.clear")}</Button>
              </div>
            </div>
          </div>
        )}
        <ZoneForm key={editing?.id ?? "new"} kind={editing?.kind ?? "custom"} zone={editing} config={config}
          readOnly={readOnly} saving={saving} onSubmit={submit} onCancel={back}
          submitDisabled={drawingActive && pts.length < 3} />
      </div>
    )
  }

  // ── list ──
  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="grid grid-cols-3 gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs" onClick={() => { ctl.setMode("select"); setView({ v: "agglo" }) }}>
            <Building2 className="h-3.5 w-3.5 text-blue-600" />{t("cl.addAgglo")}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs" onClick={() => { ctl.setMode("select"); setView({ v: "road" }) }}>
            <Route className="h-3.5 w-3.5 text-orange-500" />{t("cl.addRoad")}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs" onClick={() => { ctl.setDrawing([]); ctl.setMode("draw"); setView({ v: "draw" }) }}>
            <PenTool className="h-3.5 w-3.5 text-violet-500" />{t("cl.draw")}
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cl.searchZones")} className="h-8 pl-7 text-xs" />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as "all" | ZoneKind)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("cl.allKinds")}</SelectItem>
            {(["agglomeration", "road_section", "custom"] as const).map((k) => (
              <SelectItem key={k} value={k}>{t(`cl.kind.${k}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("cl.zoneCount", { n: zones.length })}</p>
      {zones.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">{t("cl.noZones")}</p>
      ) : filtered.length === 0 ? (
        <p className="p-3 text-center text-xs text-muted-foreground">{t("cl.noMatch")}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {filtered.map((z) => {
            const Icon = kindIcon(z.kind)
            const sel = selectedId === z.id, hov = hoveredId === z.id
            return (
              <li key={z.id}
                className={`flex cursor-pointer items-start gap-2 px-2.5 py-2 transition-colors ${sel ? "bg-primary/10" : hov ? "bg-muted/60" : "hover:bg-muted/40"}`}
                onMouseEnter={() => onHover(z.id)} onMouseLeave={() => onHover(null)}
                onClick={() => { onSelect(z.id); ctl.fitTo(bboxBounds(z.bbox)) }}>
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ background: zoneColor(z.kind, z.environment, z.is_active) }}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="truncate text-sm font-medium">{z.name}</span>
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">{t(`cl.kind.${z.kind}`)}</Badge>
                    <Badge variant="outline" className={`h-4 px-1 text-[10px] ${z.environment === "urban" ? "border-blue-500/40 text-blue-600" : "border-orange-500/40 text-orange-600"}`}>
                      {t(`cl.env.${z.environment}`)}
                    </Badge>
                    {!z.is_active && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{t("cl.inactive")}</Badge>}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{summary(z)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Switch checked={z.is_active} disabled={readOnly} onCheckedChange={(v) => toggleActive(z, v)}
                    className="scale-75" aria-label={t("cl.form.active")} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(z)} title={t("cl.edit")}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {!readOnly && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setToDelete(z)} title={t("cl.delete")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cl.deleteTitle", { name: toDelete?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("cl.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cl.form.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("cl.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FlowHeader({ title, sub, hint, onBack }: { title: string; sub?: string; hint?: string; onBack: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <h3 className="text-sm font-semibold">{title}</h3>
        {sub && <span className="truncate text-xs text-muted-foreground">— {sub}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

interface FlowProps {
  config: ClusteringConfig
  ctl: MapCtl
  onBack: () => void
  onSaved: () => void
  saving: boolean
  setSaving: (b: boolean) => void
}

function AggloFlow({ config, ctl, onBack, onSaved, saving, setSaving }: FlowProps) {
  const t = useT()
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<BoundaryCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<BoundaryCandidate | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const text = q.trim()
    if (text.length < 2) { setResults(null); return }
    const id = ++seq.current
    const timer = setTimeout(async () => {
      setBusy(true); setError(null)
      try {
        const r = await searchBoundaries(text)
        if (id === seq.current) setResults(r)
      } catch (e) {
        if (id === seq.current) { setResults([]); setError(errorText(t, e, "cl")) }
      } finally { if (id === seq.current) setBusy(false) }
    }, 600)
    return () => clearTimeout(timer)
  }, [q, t])

  const preview = (c: BoundaryCandidate | null) => {
    ctl.setPreview(c ? [c.geometry] : picked ? [picked.geometry] : null, "urban")
  }

  const pick = (c: BoundaryCandidate) => {
    setPicked(c)
    ctl.setPreview([c.geometry], "urban")
    ctl.fitTo(c.bbox ? [[c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[3]]] : geometryBounds(c.geometry))
  }

  const submit = async (v: ZoneFormValues) => {
    if (!picked) return
    setSaving(true)
    try {
      await createZone({
        ...v, kind: "agglomeration", geometry: picked.geometry, source: "nominatim",
        source_ref: picked.osm_type && picked.osm_id ? `${picked.osm_type}/${picked.osm_id}` : null,
        source_meta: { display_name: picked.display_name, class: picked.class, type: picked.type,
          approximate: picked.approximate },
        country: picked.display_name.split(",").pop()?.trim() || null,
      })
      onSaved()
    } catch (e) { toast.error(errorText(t, e, "cl")) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <FlowHeader title={t("cl.agglo.title")} hint={picked ? undefined : t("cl.agglo.hint")} onBack={onBack} />
      {!picked ? (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cl.agglo.ph")} className="h-9 pl-7 text-sm" />
            {busy && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {busy && !results && <p className="text-xs text-muted-foreground">{t("cl.agglo.searching")}</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {results && results.length === 0 && !error && <p className="text-xs text-muted-foreground">{t("cl.agglo.none")}</p>}
          {results && results.length > 0 && (
            <ul className="divide-y rounded-md border" onMouseLeave={() => preview(null)}>
              {results.map((c) => (
                <li key={`${c.osm_type}/${c.osm_id}`} className="cursor-pointer px-2.5 py-2 hover:bg-muted/50"
                  onMouseEnter={() => preview(c)} onClick={() => pick(c)}>
                  <div className="flex items-center gap-1.5">
                    <MapPinned className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span className="truncate text-sm font-medium">{c.name}</span>
                  </div>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{c.display_name}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">{[c.class, c.type].filter(Boolean).join(" · ")}</Badge>
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">{t("cl.agglo.area", { a: c.area_km2.toLocaleString() })}</Badge>
                    {c.approximate && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{t("cl.agglo.approx")}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-2.5 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{picked.name}</p>
              <p className="line-clamp-2 text-[11px] text-muted-foreground">{picked.display_name}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setPicked(null); ctl.setPreview(null) }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ZoneForm key={`${picked.osm_type}/${picked.osm_id}`} kind="agglomeration" initialName={picked.name}
            config={config} saving={saving} onSubmit={submit} onCancel={onBack} />
        </>
      )}
    </div>
  )
}

function RoadFlow({ config, ctl, onBack, onSaved, saving, setSaving }: FlowProps) {
  const t = useT()
  const [source, setSource] = useState<"predefined" | "places">("predefined")
  const [sections, setSections] = useState<RouteSection[]>([])
  const [routeKey, setRouteKey] = useState("")
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  const [width, setWidth] = useState(String(config.default_corridor_width_m))
  const [preview, setPreview] = useState<RoadSectionOut | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getRouteSections().then((r) => setSections(r.sections)).catch(() => setSections([])) }, [])

  const target = source === "predefined"
    ? (routeKey ? { route_key: routeKey } : null)
    : (from && to ? { start: [from.lat, from.lon] as [number, number], end: [to.lat, to.lon] as [number, number] } : null)
  const widthOk = Number(width) >= 20 && Number(width) <= 5000

  // A changed route / width invalidates the preview.
  useEffect(() => { setPreview(null); ctl.setPreview(null) }, [routeKey, from, to, source, width]) // eslint-disable-line react-hooks/exhaustive-deps

  const doPreview = async () => {
    if (!target) return
    setBusy(true)
    try {
      const name = source === "places" && from && to ? `${from.label} – ${to.label}` : undefined
      const r = await createRoadSection({ ...target, name, corridor_width_m: Number(width), preview: true })
      setPreview(r)
      ctl.setPreview([r.outline, r.geometry].filter(Boolean) as Geometry[], "rural")
      ctl.fitTo(geometryBounds(r.outline ?? r.geometry))
    } catch (e) {
      toast.error(errorText(t, e, "cl") || t("cl.road.failed"))
    } finally { setBusy(false) }
  }

  const submit = async (v: ZoneFormValues) => {
    if (!target) return
    setSaving(true)
    try {
      await createRoadSection({
        ...target, name: v.name, corridor_width_m: Number(width), environment: v.environment,
        default_radius_m: v.default_radius_m, type_radius: v.type_radius, signalement_radius: v.signalement_radius,
        priority: v.priority, is_active: v.is_active,
      })
      onSaved()
    } catch (e) { toast.error(errorText(t, e, "cl")) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <FlowHeader title={t("cl.road.title")} hint={t("cl.road.hint")} onBack={onBack} />
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        {(["predefined", "places"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSource(s)}
            className={`rounded px-2 py-1 text-xs font-medium ${source === s ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            {t(s === "predefined" ? "cl.road.predefined" : "cl.road.places")}
          </button>
        ))}
      </div>
      {source === "predefined" ? (
        <Select value={routeKey} onValueChange={setRouteKey}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("cl.road.pick")} /></SelectTrigger>
          <SelectContent>
            {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <div className="space-y-2">
          <PlaceAutocomplete label={t("cl.road.from")} value={from} onChange={setFrom} compact />
          <PlaceAutocomplete label={t("cl.road.to")} value={to} onChange={setTo} compact />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-xs">{t("cl.road.width")}</Label>
          <p className="text-[11px] text-muted-foreground">{t("cl.road.widthHint")}</p>
        </div>
        <div className="flex items-center gap-1">
          <Input type="number" min={20} max={5000} value={width} onChange={(e) => setWidth(e.target.value)}
            className={`h-8 w-24 text-right text-sm ${widthOk ? "" : "border-destructive"}`} />
          <span className="text-xs text-muted-foreground">m</span>
        </div>
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={doPreview} disabled={!target || !widthOk || busy}>
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Route className="mr-1 h-3.5 w-3.5" />}
        {t("cl.road.preview")}
      </Button>
      {preview && (
        <>
          <p className="text-center text-xs text-muted-foreground">
            {t("cl.road.previewInfo", { km: (preview.distance_m / 1000).toFixed(1), area: preview.area_km2.toFixed(1) })}
          </p>
          <ZoneForm key={preview.name} kind="road_section" initialName={preview.name} initialEnv="rural" config={config}
            saving={saving} onSubmit={submit} onCancel={onBack} />
        </>
      )}
    </div>
  )
}
