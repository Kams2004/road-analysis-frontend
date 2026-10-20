"use client"

/**
 * Stream sources (RRAP-07-003 / 07-011): live feeds captured in segments by
 * the worker; each segment becomes a job (source_type=stream).
 * Contract: docs/spec-module7-jobs.md §4.
 */
import { Fragment, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertTriangle, Briefcase, CheckCircle2, ChevronUp, Clock, Loader2, Pause, Pencil, Play, Plus,
  Radio, RefreshCw, Trash2, Wifi, XCircle,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { fr as dfFr, es as dfEs } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge as Pill, type BadgeTone } from "@/components/status-badge"
import { DataCard, DataToolbar, TOOLBAR_SELECT } from "@/components/data-toolbar"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { ModelSelector, DEFAULT_MODEL_IDS } from "@/components/model-selector"
import { useI18n } from "@/lib/i18n"
import { useAuth } from "@/components/auth-provider"
import { RequirePermission } from "@/components/require-permission"
import { errorText } from "@/lib/auth-api"
import {
  createStream, deleteStream, getModule7Settings, listJobs, listStreams, parseDate, pauseStream, startStream,
  testStream, toBackendModels, toUiModels, updateStream,
  type Job, type StreamInput, type StreamSource, type StreamStatus, type StreamTestResult,
} from "@/lib/module7-api"

const SCOPE = "m7.streams"
const CAMERA_TYPES = ["fixed", "ptz", "dashcam", "drone", "other"]
const URL_RE = /^(rtsp|rtsps|rtmp|rtmps|https?):\/\/\S+$/i

const STATUS_TONE: Record<StreamStatus, BadgeTone> = {
  active: "green",
  paused: "slate",
  error: "red",
}

interface FormState {
  name: string
  url: string
  camera_type: string
  segment_seconds: string
  frame_skip: string
  models: string[]
}

const emptyForm = (): FormState => ({
  name: "", url: "", camera_type: "fixed", segment_seconds: "60", frame_skip: "",
  models: [...DEFAULT_MODEL_IDS],
})

export default function StreamsPage() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const canAdd = can("streams", "add")
  const canEdit = can("streams", "edit")
  const canDelete = can("streams", "delete")
  const canViewJobs = can("jobs", "view")
  const dfLocale = lang === "fr" ? dfFr : lang === "es" ? dfEs : undefined

  const [streams, setStreams] = useState<StreamSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [defaultSkip, setDefaultSkip] = useState<number | null>(null)
  const [editing, setEditing] = useState<StreamSource | "new" | null>(null)
  const [toDelete, setToDelete] = useState<StreamSource | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState<Record<string, string | undefined>>({})
  const [tests, setTests] = useState<Record<string, StreamTestResult>>({})
  const [openJobs, setOpenJobs] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StreamStatus | "all">("all")

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setStreams(await listStreams())
      setError(null)
    } catch (e) {
      setError(errorText(t, e, SCOPE))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getModule7Settings()
      .then(({ processing }) => {
        const v = processing?.frame_skip_by_source?.stream ?? processing?.frame_skip_default
        if (typeof v === "number") setDefaultSkip(v)
      })
      .catch(() => { /* needs settings:view — the hint falls back to generic text */ })
  }, [])

  // Keep last-segment / status fresh while feeds are being captured
  const anyActive = streams.some((s) => s.status === "active")
  useEffect(() => {
    if (!anyActive) return
    const h = setInterval(() => load(true), 15000)
    return () => clearInterval(h)
  }, [anyActive, load])

  const replace = (s: StreamSource) => setStreams((prev) => prev.map((x) => (x.id === s.id ? s : x)))

  const act = async (s: StreamSource, kind: "start" | "pause" | "test") => {
    setBusy((b) => ({ ...b, [s.id]: kind }))
    try {
      if (kind === "test") {
        const r = await testStream(s.id)
        setTests((m) => ({ ...m, [s.id]: r }))
        if (r.ok) toast.success(t(`${SCOPE}.testOk`))
        else toast.error(r.error || t(`${SCOPE}.testFailed`))
      } else {
        const next = kind === "start" ? await startStream(s.id) : await pauseStream(s.id)
        if (next && typeof next === "object" && "id" in next) replace(next)
        else load(true)
        toast.success(t(`${SCOPE}.done.${kind}`))
      }
    } catch (e) {
      toast.error(errorText(t, e, SCOPE))
    } finally {
      setBusy((b) => ({ ...b, [s.id]: undefined }))
    }
  }

  const handleDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteStream(toDelete.id)
      setStreams((prev) => prev.filter((x) => x.id !== toDelete.id))
      toast.success(t(`${SCOPE}.done.delete`))
      setToDelete(null)
    } catch (e) {
      toast.error(errorText(t, e, SCOPE))
    } finally {
      setDeleting(false)
    }
  }

  const visible = streams.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false
    const q = search.trim().toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)
  })

  const counts = {
    active: streams.filter((s) => s.status === "active").length,
    paused: streams.filter((s) => s.status === "paused").length,
    error: streams.filter((s) => s.status === "error").length,
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="streams">
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <PageHeader
            title={t("nav.streams")}
            description={t(`${SCOPE}.subtitle`)}
            actions={
              <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="h-9 gap-2">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                {t("ops.common.refresh")}
              </Button>
            }
          />

          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Radio} tone="blue" value={streams.length} label={t("ops.streams.total")}
              onClick={() => setStatusFilter("all")} />
            <StatCard icon={CheckCircle2} tone="green" value={counts.active} label={t(`${SCOPE}.status.active`)}
              onClick={() => setStatusFilter("active")} />
            <StatCard icon={Pause} tone="slate" value={counts.paused} label={t(`${SCOPE}.status.paused`)}
              onClick={() => setStatusFilter("paused")} />
            <StatCard icon={XCircle} tone="red" value={counts.error} label={t(`${SCOPE}.status.error`)}
              onClick={() => setStatusFilter("error")} />
          </div>

          {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}

          <DataCard>
            <DataToolbar
              search={search}
              onSearch={setSearch}
              placeholder={t("ops.streams.searchPh")}
              actions={canAdd && (
                <Button size="sm" className="h-9 gap-2" onClick={() => setEditing("new")}>
                  <Plus className="h-4 w-4" />{t(`${SCOPE}.add`)}
                </Button>
              )}
            >
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StreamStatus | "all")}>
                <SelectTrigger className={TOOLBAR_SELECT} aria-label={t("common.status")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("ops.streams.allStatus")}</SelectItem>
                  {(["active", "paused", "error"] as const).map((k) => (
                    <SelectItem key={k} value={k}>{t(`${SCOPE}.status.${k}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataToolbar>

            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">{t("ops.streams.source")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t(`${SCOPE}.cameraType`)}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t(`${SCOPE}.segment`)}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t(`${SCOPE}.frameSkip`)}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t("ops.jobs.col.models")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t(`${SCOPE}.segments`)}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("ops.streams.lastSegmentCol")}</TableHead>
                  <TableHead className="pr-4 text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && streams.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-28 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-28 text-center">
                      <Radio className="mx-auto h-7 w-7 text-muted-foreground/40" />
                      <p className="mt-2 text-sm font-medium">{streams.length === 0 ? t(`${SCOPE}.empty`) : t("ops.streams.noMatch")}</p>
                      {streams.length === 0 && <p className="mt-0.5 text-xs text-muted-foreground">{t(`${SCOPE}.emptyHint`)}</p>}
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((s) => {
                  const test = tests[s.id]
                  const lastSeg = parseDate(s.last_segment_at)
                  const b = busy[s.id]
                  const models = toUiModels(s.enabled_models ?? [])
                  return (
                    <Fragment key={s.id}>
                      <TableRow className="h-11">
                        <TableCell className="py-1.5 pl-4">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white",
                              s.status === "active" ? "bg-emerald-500" : s.status === "error" ? "bg-red-500" : "bg-slate-500",
                            )}>
                              <Radio className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="max-w-[220px] truncate font-medium leading-tight" title={s.name}>{s.name}</p>
                              <p className="max-w-[220px] truncate font-mono text-[11px] leading-tight text-muted-foreground" title={s.url}>{s.url}</p>
                              {s.last_error && (
                                <p className="flex max-w-[260px] items-center gap-1 truncate text-[11px] text-destructive" title={s.last_error}>
                                  <AlertTriangle className="h-3 w-3 shrink-0" />{s.last_error}
                                </p>
                              )}
                              {test && (
                                <p className={cn("flex max-w-[260px] items-center gap-1 truncate text-[11px]", test.ok ? "text-success" : "text-destructive")}>
                                  {test.ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                                  {test.ok
                                    ? t(`${SCOPE}.testOkRes`, { res: test.resolution || (test.width && test.height ? `${test.width}×${test.height}` : "?") })
                                    : test.error || t(`${SCOPE}.testFailed`)}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Pill tone={STATUS_TONE[s.status]}>{t(`${SCOPE}.status.${s.status}`)}</Pill>
                        </TableCell>
                        <TableCell className="hidden py-1.5 md:table-cell">{s.camera_type ? cameraLabel(t, s.camera_type) : "—"}</TableCell>
                        <TableCell className="hidden py-1.5 tabular-nums lg:table-cell">{t(`${SCOPE}.seconds`, { n: s.segment_seconds })}</TableCell>
                        <TableCell className="hidden py-1.5 xl:table-cell">
                          {s.frame_skip != null ? t("m7.common.everyN", { n: s.frame_skip }) : <span className="text-muted-foreground">{t(`${SCOPE}.defaultSkip`)}</span>}
                        </TableCell>
                        <TableCell className="hidden py-1.5 xl:table-cell">
                          <div className="flex max-w-[220px] flex-wrap gap-1">
                            {models.length === 0
                              ? <span className="text-xs text-muted-foreground">{t(`${SCOPE}.allModels`)}</span>
                              : models.map((m) => (
                                <Badge key={m} variant="secondary" className="px-1.5 text-[10px]">
                                  {t(`ops.models.${m}`) === `ops.models.${m}` ? m : t(`ops.models.${m}`)}
                                </Badge>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden py-1.5 text-right tabular-nums sm:table-cell">{(s.segments_processed ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="hidden whitespace-nowrap py-1.5 text-xs text-muted-foreground lg:table-cell">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {lastSeg ? formatDistanceToNow(lastSeg, { addSuffix: true, locale: dfLocale }) : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 pr-4 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {canEdit && (
                              <>
                                <IconBtn label={t(`${SCOPE}.test`)} disabled={!!b} onClick={() => act(s, "test")}>
                                  {b === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                                </IconBtn>
                                {s.status === "active" ? (
                                  <IconBtn label={t("ops.streams.pause")} disabled={!!b} onClick={() => act(s, "pause")}>
                                    {b === "pause" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                                  </IconBtn>
                                ) : (
                                  <IconBtn label={t("ops.streams.start")} disabled={!!b} onClick={() => act(s, "start")}
                                    className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600">
                                    {b === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                  </IconBtn>
                                )}
                                <IconBtn label={t("common.edit")} onClick={() => setEditing(s)}>
                                  <Pencil className="h-4 w-4" />
                                </IconBtn>
                              </>
                            )}
                            {canDelete && (
                              <IconBtn label={t("common.delete")} onClick={() => setToDelete(s)}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </IconBtn>
                            )}
                            {canViewJobs && (
                              <IconBtn label={t(`${SCOPE}.recentJobs`)} aria-expanded={!!openJobs[s.id]}
                                onClick={() => setOpenJobs((o) => ({ ...o, [s.id]: !o[s.id] }))}>
                                {openJobs[s.id] ? <ChevronUp className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                              </IconBtn>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {canViewJobs && openJobs[s.id] && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={9} className="px-4 py-2">
                            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t(`${SCOPE}.recentJobs`)}</p>
                            <RecentJobs stream={s} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
            {streams.length > 0 && (
              <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                {t("ui.showing", { from: visible.length ? 1 : 0, to: visible.length, total: visible.length })}
              </div>
            )}
          </DataCard>
        </div>
        </RequirePermission>
      </main>

      <StreamDialog
        target={editing}
        defaultSkip={defaultSkip}
        onClose={() => setEditing(null)}
        onSaved={(s, isNew) => {
          setStreams((prev) => (isNew ? [s, ...prev] : prev.map((x) => (x.id === s.id ? s : x))))
          setEditing(null)
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o && !deleting) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${SCOPE}.deleteTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${SCOPE}.deleteBody`, { name: toDelete?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function cameraLabel(t: (k: string) => string, v: string) {
  const k = `m7.streams.camera.${v}`
  const s = t(k)
  return s === k ? v : s
}

function IconBtn({ label, className, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button variant="ghost" size="icon" className={cn("h-8 w-8", className)} title={label} aria-label={label} {...props}>
      {children}
    </Button>
  )
}

function RecentJobs({ stream }: { stream: StreamSource }) {
  const { t, locale } = useI18n()
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listJobs({ source_type: "stream", search: stream.name, limit: 10 })
      .then((r) => {
        if (!alive) return
        // `search` matches names loosely; keep this stream's jobs when the id is known
        setJobs(r.items.filter((j) => !j.stream_id || j.stream_id === stream.id))
      })
      .catch((e) => alive && setError(errorText(t, e, SCOPE)))
    return () => { alive = false }
  }, [stream.id, stream.name, stream.last_segment_at, t])

  if (error) return <p className="text-xs text-destructive">{error}</p>
  if (!jobs) return <div className="flex justify-center py-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
  if (jobs.length === 0) return <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t(`${SCOPE}.noJobs`)}</p>
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {jobs.map((j) => {
        const d = parseDate(j.created_at)
        return (
          <li key={j.id}>
            <Link href={`/jobs?job=${encodeURIComponent(j.id)}`}
              className="flex items-center gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-muted/50">
              <span className="min-w-0 flex-1 truncate">{j.source_name || j.filename}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {d ? d.toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
              <span className="w-10 text-right text-xs tabular-nums text-primary">{j.detections}</span>
              <Pill status={j.status}>{t(`ops.status.${j.status}`)}</Pill>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function StreamDialog({ target, defaultSkip, onClose, onSaved }: {
  target: StreamSource | "new" | null
  defaultSkip: number | null
  onClose: () => void
  onSaved: (s: StreamSource, isNew: boolean) => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const isNew = target === "new"

  useEffect(() => {
    if (!target) return
    setErrors({})
    if (target === "new") setForm(emptyForm())
    else setForm({
      name: target.name,
      url: target.url,
      camera_type: target.camera_type || "other",
      segment_seconds: String(target.segment_seconds ?? 60),
      frame_skip: target.frame_skip != null ? String(target.frame_skip) : "",
      models: target.enabled_models?.length ? toUiModels(target.enabled_models) : [...DEFAULT_MODEL_IDS],
    })
  }, [target])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }

  const validate = (): StreamInput | null => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = t(`${SCOPE}.err.nameRequired`)
    if (!URL_RE.test(form.url.trim())) e.url = t(`${SCOPE}.err.url`)
    const seg = Number(form.segment_seconds)
    if (!Number.isInteger(seg) || seg < 10 || seg > 3600) e.segment_seconds = t(`${SCOPE}.err.segment`)
    let skip: number | null = null
    if (form.frame_skip.trim() !== "") {
      skip = Number(form.frame_skip)
      if (!Number.isInteger(skip) || skip < 1 || skip > 60) e.frame_skip = t(`${SCOPE}.err.frameSkip`)
    }
    if (form.models.length === 0) e.models = t(`${SCOPE}.err.models`)
    setErrors(e)
    if (Object.keys(e).length) return null
    return {
      name: form.name.trim(),
      url: form.url.trim(),
      camera_type: form.camera_type || null,
      segment_seconds: seg,
      frame_skip: skip,
      enabled_models: toBackendModels(form.models),
    }
  }

  const save = async () => {
    const body = validate()
    if (!body || !target) return
    setSaving(true)
    try {
      const s = target === "new" ? await createStream(body) : await updateStream(target.id, body)
      toast.success(t(`${SCOPE}.saved`))
      onSaved(s, target === "new")
    } catch (err) {
      toast.error(errorText(t, err, SCOPE))
    } finally {
      setSaving(false)
    }
  }

  const cameraOptions = CAMERA_TYPES.includes(form.camera_type) ? CAMERA_TYPES : [...CAMERA_TYPES, form.camera_type]

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? t(`${SCOPE}.addTitle`) : t(`${SCOPE}.editTitle`)}</DialogTitle>
          <DialogDescription>{t(`${SCOPE}.dialogDesc`)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="st-name">{t("ops.streams.sourceName")}</Label>
            <Input id="st-name" value={form.name} onChange={(e) => set("name", e.target.value)}
              placeholder={t("ops.streams.sourceNamePh")} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="st-url">{t(`${SCOPE}.url`)}</Label>
            <Input id="st-url" value={form.url} onChange={(e) => set("url", e.target.value)}
              placeholder="rtsp://camera.local:554/stream1" className="font-mono text-sm" aria-invalid={!!errors.url} />
            <p className="text-xs text-muted-foreground">{t(`${SCOPE}.urlHint`)}</p>
            {errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t(`${SCOPE}.cameraType`)}</Label>
              <Select value={form.camera_type} onValueChange={(v) => set("camera_type", v)}>
                <SelectTrigger className="w-full" aria-label={t(`${SCOPE}.cameraType`)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cameraOptions.map((c) => <SelectItem key={c} value={c}>{cameraLabel(t, c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-seg">{t(`${SCOPE}.segmentSeconds`)}</Label>
              <Input id="st-seg" type="number" min={10} max={3600} value={form.segment_seconds}
                onChange={(e) => set("segment_seconds", e.target.value)} aria-invalid={!!errors.segment_seconds} />
              {errors.segment_seconds && <p className="text-xs text-destructive">{errors.segment_seconds}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="st-skip">{t(`${SCOPE}.frameSkip`)}</Label>
            <Input id="st-skip" type="number" min={1} max={60} value={form.frame_skip}
              placeholder={defaultSkip != null ? String(defaultSkip) : ""}
              onChange={(e) => set("frame_skip", e.target.value)} aria-invalid={!!errors.frame_skip} className="w-32" />
            <p className="text-xs text-muted-foreground">
              {defaultSkip != null ? t(`${SCOPE}.frameSkipHintN`, { n: defaultSkip }) : t(`${SCOPE}.frameSkipHint`)}
            </p>
            {errors.frame_skip && <p className="text-xs text-destructive">{errors.frame_skip}</p>}
          </div>
          <div className="space-y-2">
            <Label>{t("ops.jobs.col.models")}</Label>
            <ModelSelector selectedModels={form.models} onSelectionChange={(m) => set("models", m)} />
            {errors.models && <p className="text-xs text-destructive">{errors.models}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
