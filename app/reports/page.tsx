"use client"

/**
 * Reports (Module 14, RRAP-13-011/012/013): PDF reports generated server-side
 * — AI hazards, community reports, historical risk, driver behaviour and
 * collision prevention — filtered by type(s), status, period, area (cluster
 * zone / town) and path (road section or from → to, with a corridor). Each
 * generated PDF is kept (history: re-download, delete).
 */
import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle, ArrowLeftRight, Car, Download, FileBarChart, FileText, History, Loader2, Megaphone,
  Route, ShieldAlert, Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { PageShell } from "@/components/dashboard/page-shell"
import { PageHeader } from "@/components/page-header"
import { Panel, EmptyState } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlaceAutocomplete } from "@/components/place-autocomplete"
import { RouteSectionSelect, useRouteSections } from "@/components/route-search-bar"
import { parseUtc } from "@/components/dashboard/types"
import { useAuth } from "@/components/auth-provider"
import type { Place } from "@/lib/routes-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type ReportKey = "hazards" | "community" | "historical" | "driver_behaviour" | "collision"

interface TypeOption { value: string; count: number | null }
interface ReportType {
  key: ReportKey; module: string; allowed: boolean; types: TypeOption[]; statuses: string[]
  supports_path: boolean; supports_town: boolean; total: number | null
}
interface Options {
  sections: { id: string; name: string }[]
  zones: { id: number; name: string; kind: string }[]
  towns: string[]
  default_corridor_m: number
}
interface Report {
  id: string; report_type: ReportKey; title: string; filters: Record<string, any>; summary: Record<string, any>
  status: string; error: string | null; size_bytes: number | null; page_count: number | null
  created_by: string | null; created_at: string
}

const ICONS: Record<ReportKey, typeof FileText> = {
  hazards: AlertTriangle, community: Megaphone, historical: History, driver_behaviour: Car, collision: ShieldAlert,
}
const PERIODS = ["7d", "30d", "90d", "12m", "all", "custom"] as const
type PathMode = "none" | "section" | "route"
const NONE = "__none__"

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, { cache: "no-store", ...init })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const d = body?.detail
    throw new Error(typeof d === "string" ? d : d?.message || `HTTP ${res.status}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

async function downloadPdf(r: Report) {
  const res = await fetch(`/api/proxy/reports/${r.id}/download`, { cache: "no-store" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const cd = res.headers.get("content-disposition") ?? ""
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? `report-${r.id.slice(0, 8)}.pdf`
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export default function ReportsPage() {
  return (
    <PageShell module="reports">
      <Reports />
    </PageShell>
  )
}

function Reports() {
  const { t, lang, locale } = useI18n()
  const { can } = useAuth()
  const canAdd = can("reports", "add")
  const canDelete = can("reports", "delete")

  const [types, setTypes] = useState<ReportType[]>([])
  const [options, setOptions] = useState<Options | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [kind, setKind] = useState<ReportKey>("hazards")

  // form
  const [title, setTitle] = useState("")
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [zoneId, setZoneId] = useState<string>(NONE)
  const [town, setTown] = useState<string>(NONE)
  const [pathMode, setPathMode] = useState<PathMode>("none")
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  const [corridor, setCorridor] = useState<string>("")
  const [images, setImages] = useState(true)
  const [language, setLanguage] = useState<string>(lang)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  // history
  const [history, setHistory] = useState<Report[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const { sections } = useRouteSections()

  useEffect(() => { setLanguage(lang) }, [lang])

  useEffect(() => {
    Promise.all([api<ReportType[]>("reports/types"), api<Options>("reports/options")])
      .then(([ty, op]) => {
        setTypes(ty)
        setOptions(op)
        setCorridor(String(op.default_corridor_m))
        const first = ty.find((x) => x.allowed)
        if (first) setKind(first.key)
      })
      .catch((e: Error) => setLoadErr(e.message))
  }, [])

  useEffect(() => {
    setHistoryLoading(true)
    api<{ total: number; items: Report[] }>("reports?limit=50")
      .then((d) => { setHistory(d.items); setHistoryTotal(d.total) })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [reload])

  const current = types.find((x) => x.key === kind)
  useEffect(() => { setPicked([]); setStatuses([]) }, [kind])
  useEffect(() => {
    if (current && !current.supports_path) setPathMode("none")
  }, [current])

  const typeLabel = useCallback((k: ReportKey, v: string) => {
    const key = k === "hazards" ? `pmap.type.${v}` : k === "community" ? `pmap.sig.type.${v}` : `dash.hist.type.${v}`
    const s = t(key)
    return s === key ? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : s
  }, [t])

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const generate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErr(null)
    let path: Record<string, unknown> | undefined
    if (pathMode === "section") {
      if (!sectionId) { setFormErr(t("rep.err.section")); return }
      path = { section_id: sectionId }
    } else if (pathMode === "route") {
      if (!from || !to) { setFormErr(t("rep.err.route")); return }
      path = { from: { lat: from.lat, lon: from.lon, label: from.label }, to: { lat: to.lat, lon: to.lon, label: to.label } }
    }
    const body: Record<string, unknown> = {
      report_type: kind,
      title: title.trim() || undefined,
      types: picked,
      statuses,
      include_images: images,
      language,
    }
    if (period === "custom") {
      if (!dateFrom && !dateTo) { setFormErr(t("rep.err.dates")); return }
      body.date_from = dateFrom || undefined
      body.date_to = dateTo || undefined
    } else {
      body.period = period
    }
    if (zoneId !== NONE) body.zone_id = Number(zoneId)
    if (town !== NONE) body.town = town
    if (path) {
      body.path = path
      const c = Number(corridor)
      if (c > 0) body.corridor_m = c
    }
    setBusy(true)
    try {
      const rep = await api<Report>("reports", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      await downloadPdf(rep)
      toast.success(t("rep.generated", { n: rep.page_count ?? 0 }))
      setReload((n) => n + 1)
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r: Report) => {
    if (!window.confirm(t("rep.confirmDelete", { title: r.title }))) return
    try {
      await api(`reports/${r.id}`, { method: "DELETE" })
      setReload((n) => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const when = (s: string) => parseUtc(s).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
  const describe = (r: Report) => {
    const f = r.filters ?? {}
    const parts: string[] = []
    parts.push(f.date_from || f.date_to ? `${f.date_from ?? "…"} → ${f.date_to ?? "…"}` : t(`rep.period.${f.period ?? "all"}`))
    if (f.types?.length) parts.push(f.types.map((v: string) => typeLabel(r.report_type, v)).join(", "))
    if (f.resolved_path) parts.push(`${f.resolved_path.name} (${f.resolved_path.length_km} km, ±${f.resolved_path.corridor_m} m)`)
    if (f.zone_name) parts.push(f.zone_name)
    if (f.town) parts.push(f.town)
    return parts.join(" · ")
  }

  const allowedCount = types.filter((x) => x.allowed).length

  return (
    <>
      <PageHeader title={t("dash.nav.reports")} description={t("rep.subtitle")} />
      {loadErr && <p className="mb-3 text-sm text-destructive">{loadErr}</p>}

      {/* Report types */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(types.length ? types : []).map((rt) => {
          const Icon = ICONS[rt.key] ?? FileText
          const active = rt.key === kind
          return (
            <button
              key={rt.key}
              type="button"
              disabled={!rt.allowed}
              onClick={() => setKind(rt.key)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition",
                active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50",
                !rt.allowed && "cursor-not-allowed opacity-50",
              )}
            >
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-semibold text-foreground">{t(`rep.type.${rt.key}`)}</span>
              <span className="text-xs leading-snug text-muted-foreground">{t(`rep.type.${rt.key}.desc`)}</span>
              <span className="mt-auto text-[11px] font-medium text-muted-foreground">
                {rt.allowed ? t("rep.stored", { n: rt.total ?? 0 }) : t("rep.noRight")}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Filters */}
        <Panel title={current ? t("rep.form.title", { type: t(`rep.type.${current.key}`) }) : t("rep.form")} className="xl:col-span-3">
          {!canAdd || allowedCount === 0 ? (
            <EmptyState>{t("rep.noAdd")}</EmptyState>
          ) : (
            <form onSubmit={generate} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="rep-title">{t("rep.f.title")}</Label>
                  <Input id="rep-title" value={title} onChange={(e) => setTitle(e.target.value)}
                         placeholder={current ? t(`rep.type.${current.key}`) : ""} maxLength={160} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("rep.f.period")}</Label>
                  <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => <SelectItem key={p} value={p}>{t(`rep.period.${p}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {period === "custom" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="rep-from-d">{t("rep.f.dateFrom")}</Label>
                      <Input id="rep-from-d" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="rep-to-d">{t("rep.f.dateTo")}</Label>
                      <Input id="rep-to-d" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              {current && current.types.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{t("rep.f.types")}</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {picked.length ? t("rep.f.typesN", { n: picked.length }) : t("rep.f.typesAll")}
                    </span>
                  </div>
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                    {current.types.map((o) => {
                      const on = picked.includes(o.value)
                      return (
                        <button key={o.value} type="button" onClick={() => setPicked((l) => toggle(l, o.value))}
                                aria-pressed={on}
                                className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                                  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                                  !on && !o.count && "text-muted-foreground")}>
                          {typeLabel(current.key, o.value)}
                          <span className={cn("tabular-nums", on ? "opacity-80" : "text-muted-foreground")}>{o.count ?? 0}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {current && current.statuses.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("rep.f.statuses")}</Label>
                  <div className="flex flex-wrap gap-3">
                    {current.statuses.map((s) => (
                      <label key={s} className="inline-flex items-center gap-1.5 text-sm">
                        <Checkbox checked={statuses.includes(s)} onCheckedChange={() => setStatuses((l) => toggle(l, s))} />
                        {t(`rep.status.${s}`)}
                      </label>
                    ))}
                    <span className="text-[11px] text-muted-foreground self-center">{statuses.length ? "" : t("rep.f.statusesAll")}</span>
                  </div>
                </div>
              )}

              {current?.supports_path && (
                <fieldset className="space-y-2 rounded-lg border border-border p-3">
                  <legend className="flex items-center gap-1.5 px-1 text-xs font-medium">
                    <Route className="h-3.5 w-3.5" /> {t("rep.f.path")}
                  </legend>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup">
                    {(["none", "section", "route"] as PathMode[]).map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={pathMode === m}
                              onClick={() => setPathMode(m)}
                              className={cn("rounded-md border px-2.5 py-1 text-xs",
                                pathMode === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-border hover:bg-muted")}>
                        {t(`rep.path.${m}`)}
                      </button>
                    ))}
                  </div>
                  {pathMode === "section" && (
                    <RouteSectionSelect sections={sections} value={sectionId} onPick={(s) => setSectionId(s?.id ?? null)} />
                  )}
                  {pathMode === "route" && (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr] md:items-end">
                      <PlaceAutocomplete id="rep-from" label={t("hist.route.from")} value={from} onChange={setFrom}
                                         placeholder={t("hist.route.fromPh")} withMyPosition />
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 justify-self-center"
                              title={t("rt.swap")} aria-label={t("rt.swap")} onClick={() => { setFrom(to); setTo(from) }}>
                        <ArrowLeftRight className="h-4 w-4" />
                      </Button>
                      <PlaceAutocomplete id="rep-to" label={t("hist.route.to")} value={to} onChange={setTo}
                                         placeholder={t("hist.route.toPh")} />
                    </div>
                  )}
                  {pathMode !== "none" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-xs" htmlFor="rep-corridor">{t("rep.f.corridor")}</Label>
                      <Input id="rep-corridor" type="number" min={5} max={5000} step={5} value={corridor}
                             onChange={(e) => setCorridor(e.target.value)} className="h-8 w-24" />
                      <span className="text-[11px] text-muted-foreground">{t("rep.f.corridorHint")}</span>
                    </div>
                  )}
                </fieldset>
              )}

              {current && current.key !== "collision" && options && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("rep.f.zone")}</Label>
                    <Select value={zoneId} onValueChange={setZoneId}>
                      <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t("rep.f.anyZone")}</SelectItem>
                        {options.zones.map((z) => <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {current.supports_town && (
                    <div className="space-y-1">
                      <Label className="text-xs">{t("rep.f.town")}</Label>
                      <Select value={town} onValueChange={setTown}>
                        <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t("rep.f.anyTown")}</SelectItem>
                          {options.towns.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                {(kind === "hazards" || kind === "community") && (
                  <label className="inline-flex items-center gap-1.5 text-sm">
                    <Checkbox checked={images} onCheckedChange={(v) => setImages(v === true)} />
                    {t("rep.f.images")}
                  </label>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{t("rep.f.language")}</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(kind === "hazards" || kind === "community") && (
                <p className="text-[11px] text-muted-foreground">{t("rep.imagesNote")}</p>
              )}

              {formErr && <p className="text-sm text-destructive">{formErr}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={busy || !current?.allowed} className="gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
                  {busy ? t("rep.generating") : t("rep.generate")}
                </Button>
              </div>
            </form>
          )}
        </Panel>

        {/* What's in it */}
        <Panel title={t("rep.contents")} className="xl:col-span-2">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[1, 2, 3, 4].map((i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {t(`rep.contents.${kind}.${i}`) === `rep.contents.${kind}.${i}` ? t(`rep.contents.common.${i}`) : t(`rep.contents.${kind}.${i}`)}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* History */}
      <Panel title={t("rep.history", { n: historyTotal })} className="mt-4" bodyClassName="pb-1">
        {historyLoading ? (
          <EmptyState><Loader2 className="h-5 w-5 animate-spin" /></EmptyState>
        ) : history.length === 0 ? (
          <EmptyState>{t("rep.historyEmpty")}</EmptyState>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("rep.col.report")}</th>
                  <th className="px-2 py-2 font-medium">{t("rep.col.filters")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("rep.col.items")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("rep.col.pages")}</th>
                  <th className="px-2 py-2 font-medium">{t("rep.col.created")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("rep.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const Icon = ICONS[r.report_type] ?? FileText
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <p className="flex items-center gap-1.5 font-medium text-foreground">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{r.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{t(`rep.type.${r.report_type}`)}</p>
                      </td>
                      <td className="max-w-[22rem] px-2 py-2 text-xs text-muted-foreground">{describe(r)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.summary?.items ?? "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.page_count ?? "—"}
                        {r.size_bytes ? <span className="block text-[11px] text-muted-foreground">{(r.size_bytes / 1024).toFixed(0)} KB</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                        {when(r.created_at)}
                        {r.created_by && <span className="block">{r.created_by}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <Button size="sm" variant="outline" className="h-7 gap-1"
                                onClick={() => downloadPdf(r).catch((e) => toast.error(String(e?.message ?? e)))}
                                disabled={r.status !== "ready"}>
                          <Download className="h-3.5 w-3.5" /> PDF
                        </Button>
                        {canDelete && (
                          <Button size="sm" variant="ghost" className="ml-1 h-7 w-7 p-0 text-destructive"
                                  title={t("rep.delete")} aria-label={t("rep.delete")} onClick={() => remove(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
