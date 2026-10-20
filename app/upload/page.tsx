"use client"

import { useState, useCallback, useEffect, useRef, memo } from "react"
import Link from "next/link"
import {
  Upload, FileVideo, ImageIcon, Loader2, CheckCircle2, XCircle, Play, Trash2, Clock, Ban, ExternalLink, Film, TriangleAlert, Cpu,
  Cloud,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge as Pill, type BadgeTone } from "@/components/status-badge"
import { DataCard } from "@/components/data-toolbar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { ModelSelector, ModelBadges, DEFAULT_MODEL_IDS } from "@/components/model-selector"
import { getJob, fetchDetections, resolveMinioUrl } from "@/lib/api"
import type { JobOut, ApiDetection } from "@/lib/api"
import { cn } from "@/lib/utils"
import { subtypeText, useI18n, useT } from "@/lib/i18n"
import { useAuth } from "@/components/auth-provider"
import { RequirePermission } from "@/components/require-permission"
import { getModule7Settings, jobSubmitUrl } from "@/lib/module7-api"

const MODEL_MAP: Record<string, string> = {
  potholes: "pothole",
  traffic_lights: "signs",
  speed_hump: "speedbump",
  vehicles: "vehicles",
}


interface StagedFile {
  id: string
  file: File
  previewUrl: string
  isImage: boolean
}

type JobStatus = "uploading" | "pending" | "processing" | "done" | "failed" | "cancelled"

interface QueueItem {
  id: string
  filename: string
  selectedModels: string[]
  jobId?: string
  status: JobStatus
  /** 0-100 for upload XHR progress; then frame-based % once processing */
  progress: number
  totalFrames: number
  processedFrames: number
  detectionCount: number
  error?: string
}

interface LiveDetection extends ApiDetection {
  _jobId: string
}

// Poll every 2 s while pending/processing
const POLL_MS = 2000

export default function UploadPage() {
  const [selectedModels, setSelectedModels] = useState<string[]>(
    DEFAULT_MODEL_IDS
  )
  const [isDragging, setIsDragging] = useState(false)
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [liveResults, setLiveResults] = useState<LiveDetection[]>([])
  const [activeTab, setActiveTab] = useState("upload")
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const seenDetections = useRef<Set<string>>(new Set())
  // track detection offset per job so we page through all detections
  const detOffsets = useRef<Map<string, number>>(new Map())
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const canAdd = can("jobs", "add")
  // Frame sampling (RRAP-07-013): default comes from the `processing` settings;
  // an override (1–60) is sent as `frame_skip`.
  const [defaultSkip, setDefaultSkip] = useState<number | null>(null)
  const [overrideSkip, setOverrideSkip] = useState(false)
  const [frameSkip, setFrameSkip] = useState("5")
  const frameSkipNum = Number(frameSkip)
  const frameSkipValid = !overrideSkip || (Number.isInteger(frameSkipNum) && frameSkipNum >= 1 && frameSkipNum <= 60)

  useEffect(() => {
    getModule7Settings()
      .then(({ processing }) => {
        if (!processing) return
        const v = processing.frame_skip_by_source?.upload ?? processing.frame_skip_default
        if (typeof v === "number") { setDefaultSkip(v); setFrameSkip(String(v)) }
      })
      .catch(() => { /* settings need settings:view — fall back to the server default */ })
  }, [])
  // Displayed label for a detection type; falls back to the raw identifier.
  const typeLabel = (ty: string) => { const k = `ops.detType.${ty}`; const v = t(k); return v === k ? ty : v }

  useEffect(() => {
    const timers = pollTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      staged.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── file staging ──────────────────────────────────────────────────────────

  const stageFiles = useCallback((files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith("image/")
      const isVideo = file.type.startsWith("video/")
      if (!isImage && !isVideo) return
      const id = `staged-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setStaged((prev) => [...prev, { id, file, previewUrl: URL.createObjectURL(file), isImage }])
    })
  }, [])

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const item = prev.find((s) => s.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((s) => s.id !== id)
    })
  }

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false); stageFiles(e.dataTransfer.files)
  }, [stageFiles])

  // ── XHR upload with real progress ────────────────────────────────────────

  const uploadWithProgress = (
    file: File,
    models: string[],
    frameSkipOverride: number | null,
    onProgress: (pct: number) => void
  ): Promise<JobOut> =>
    new Promise((resolve, reject) => {
      const form = new FormData()
      form.append("file", file)
      const xhr = new XMLHttpRequest()
      xhr.open("POST", jobSubmitUrl(models, frameSkipOverride))
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          try {
            const detail = JSON.parse(xhr.responseText).detail
            const msg = typeof detail === "string" ? detail : detail?.message ?? (Array.isArray(detail) ? detail.map((d: { msg?: string }) => d.msg).join("; ") : "")
            reject(new Error(msg || `HTTP ${xhr.status}`))
          }
          catch { reject(new Error(`HTTP ${xhr.status}`)) }
        }
      }
      xhr.onerror = () => reject(new Error(t("ops.upload.networkError")))
      xhr.send(form)
    })

  // ── polling ───────────────────────────────────────────────────────────────

  const startPolling = useCallback((queueId: string, jobId: string) => {
    if (pollTimers.current.has(queueId)) return
    detOffsets.current.set(jobId, 0)

    const tick = async () => {
      try {
        const job: JobOut = await getJob(jobId)

        // Calculate % — guard against total_frames=0 during the first few polls
        let pct = 0
        if (job.total_frames > 0) {
          pct = Math.min(99, Math.round((job.processed / job.total_frames) * 100))
        }
        if (job.status === "done") pct = 100

        setQueue((prev) =>
          prev.map((q) =>
            q.id === queueId
              ? {
                  ...q,
                  status: job.status as JobStatus,
                  progress: pct,
                  totalFrames: job.total_frames,
                  processedFrames: job.processed,
                  detectionCount: job.detections,
                  error: job.error ?? undefined,
                }
              : q
          )
        )

        // Fetch NEW detections for this job (paginate via offset)
        try {
          const offset = detOffsets.current.get(jobId) ?? 0
          const det = await fetchDetections({ job_id: jobId, skip: offset, limit: 50 })
          const fresh = det.items.filter((d) => !seenDetections.current.has(d.id))
          if (fresh.length) {
            fresh.forEach((d) => seenDetections.current.add(d.id))
            detOffsets.current.set(jobId, offset + fresh.length)
            setLiveResults((prev) => [...fresh.map((d) => ({ ...d, _jobId: jobId })), ...prev])
            // Switch to results tab when first detection arrives
            setActiveTab((cur) => cur === "queue" ? "results" : cur)
          }
        } catch { /* non-fatal */ }

        if (job.status === "pending" || job.status === "processing") {
          pollTimers.current.set(queueId, setTimeout(tick, POLL_MS))
        } else {
          pollTimers.current.delete(queueId)
          // Keep done/failed visible — never auto-remove live results
          // User clears results manually via "Clear all"
          setTimeout(() => {
            setQueue((prev) => prev.filter((q) => q.id !== queueId))
          }, 15_000)
        }
      } catch (e) {
        setQueue((prev) =>
          prev.map((q) => q.id === queueId ? { ...q, status: "failed", error: String(e) } : q)
        )
        pollTimers.current.delete(queueId)
      }
    }

    // Start first tick immediately
    tick()
  }, [])

  // ── submit ────────────────────────────────────────────────────────────────

  const submitAll = async () => {
    if (!canAdd || staged.length === 0 || selectedModels.length === 0 || !frameSkipValid) return
    const skipOverride = overrideSkip ? frameSkipNum : null
    const toSubmit = [...staged]
    setStaged([])
    toSubmit.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    setActiveTab("queue")

    for (const s of toSubmit) {
      const qId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const item: QueueItem = {
        id: qId,
        filename: s.file.name,
        selectedModels: [...selectedModels],
        status: "uploading",
        progress: 0,
        totalFrames: 0,
        processedFrames: 0,
        detectionCount: 0,
      }
      setQueue((prev) => [...prev, item])

      try {
        const backendModels = selectedModels.map((m) => MODEL_MAP[m] ?? m)
        const job = await uploadWithProgress(s.file, backendModels, skipOverride, (pct) => {
          setQueue((prev) =>
            prev.map((q) => q.id === qId ? { ...q, progress: pct } : q)
          )
        })
        setQueue((prev) =>
          prev.map((q) =>
            q.id === qId
              ? { ...q, jobId: job.id, status: job.status as JobStatus, progress: 0 }
              : q
          )
        )
        startPolling(qId, job.id)
      } catch (e) {
        setQueue((prev) =>
          prev.map((q) => q.id === qId ? { ...q, status: "failed", error: String(e) } : q)
        )
      }
    }
  }

  const activeQueue = queue.filter((q) => q.status !== "done" && q.status !== "failed" && q.status !== "cancelled")
  const doneCount = queue.filter((q) => q.status === "done").length

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="jobs" action="add">
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <PageHeader title={t("ops.upload.title")} description={t("ops.upload.subtitle")}
            actions={
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href="/cloud-sources"><Cloud className="h-4 w-4" />{t("cs.importFromCloud")}</Link>
              </Button>
            } />

          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={FileVideo} tone="teal" value={staged.length} label={t("ops.upload.kpi.staged")}
              onClick={() => setActiveTab("upload")} />
            <StatCard icon={Cpu} tone="blue" value={activeQueue.length} label={t("ops.upload.kpi.inProgress")}
              onClick={() => setActiveTab("queue")} />
            <StatCard icon={CheckCircle2} tone="green" value={doneCount} label={t("ops.upload.kpi.completed")}
              onClick={() => setActiveTab("queue")} />
            <StatCard icon={TriangleAlert} tone="purple" value={liveResults.length} label={t("ops.upload.kpi.detections")}
              onClick={() => setActiveTab("results")} />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="upload" className="gap-2 text-sm">
                <Upload className="h-4 w-4" />
                {t("ops.upload.tab.upload")}
              </TabsTrigger>
              <TabsTrigger value="queue" className="gap-2 text-sm">
                <Clock className="h-4 w-4" />
                {t("ops.upload.tab.queue")}
                {activeQueue.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {activeQueue.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="results" className="gap-2 text-sm">
                <ImageIcon className="h-4 w-4" />
                {t("ops.upload.tab.results")}
                {liveResults.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {liveResults.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Upload Tab ── */}
            <TabsContent value="upload">
              <DataCard>
                <div className="border-b px-4 py-3">
                  <h2 className="text-sm font-semibold">{t("ops.upload.selectTitle")}</h2>
                  <p className="text-xs text-muted-foreground">{t("ops.upload.selectDesc")}</p>
                </div>
                <div className="space-y-4 p-4">
                  <ModelSelector selectedModels={selectedModels} onSelectionChange={setSelectedModels} />

                  <div className="space-y-2 rounded-lg border border-border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500 text-white">
                          <Film className="h-4 w-4" />
                        </div>
                        <div>
                          <Label htmlFor="frame-skip-override" className="text-sm font-medium">{t("m7.upload.frameSkip")}</Label>
                          <p className="text-xs text-muted-foreground">
                            {defaultSkip != null
                              ? t("m7.upload.frameSkipDefault", { n: defaultSkip })
                              : t("m7.upload.frameSkipServer")}
                          </p>
                        </div>
                      </div>
                      <Switch id="frame-skip-override" checked={overrideSkip} onCheckedChange={setOverrideSkip} />
                    </div>
                    {overrideSkip && (
                      <div className="flex flex-wrap items-center gap-3 sm:pl-11">
                        <Input
                          id="frame-skip"
                          type="number" min={1} max={60} step={1}
                          value={frameSkip}
                          onChange={(e) => setFrameSkip(e.target.value)}
                          className="h-9 w-24"
                          aria-label={t("m7.upload.frameSkip")}
                          aria-invalid={!frameSkipValid}
                        />
                        <span className="text-sm text-muted-foreground">
                          {frameSkipValid ? t("m7.common.everyN", { n: frameSkipNum }) : t("m7.upload.frameSkipInvalid")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 transition-all",
                      isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
                      selectedModels.length === 0 && "opacity-50 pointer-events-none"
                    )}
                  >
                    <input
                      type="file" accept="video/*,image/*" multiple
                      onChange={(e) => stageFiles(e.target.files)}
                      disabled={selectedModels.length === 0}
                      className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="mt-2 text-sm font-medium">{t("ops.upload.drop")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("ops.upload.formats")}</p>
                  </div>

                  {staged.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{t("ops.upload.selectedFiles", { n: staged.length })}</p>
                        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => {
                          staged.forEach((s) => URL.revokeObjectURL(s.previewUrl))
                          setStaged([])
                        }}>{t("ops.upload.removeAll")}</Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {staged.map((s) => (
                          <div key={s.id} className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
                            {s.isImage
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={s.previewUrl} alt={s.file.name} className="h-32 w-full object-cover" />
                              : <video src={s.previewUrl} className="h-32 w-full object-cover" controls preload="metadata" />
                            }
                            <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                              <p className="truncate text-xs font-medium">{s.file.name}</p>
                              <Button
                                variant="ghost" size="icon"
                                className="h-6 w-6 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => removeStaged(s.id)}
                                aria-label={t("ops.upload.removeFile")}
                                title={t("ops.upload.removeFile")}
                              ><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <Button className="h-9 gap-2" onClick={submitAll} disabled={!canAdd || selectedModels.length === 0 || !frameSkipValid}>
                          <Play className="h-4 w-4" />
                          {t(staged.length > 1 ? "ops.upload.analyseMany" : "ops.upload.analyseOne", { n: staged.length })}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DataCard>
            </TabsContent>

            {/* ── Processing Queue Tab ── */}
            <TabsContent value="queue">
              <DataCard>
                <div className="border-b px-4 py-3">
                  <h2 className="text-sm font-semibold">{t("ops.upload.tab.queue")}</h2>
                  <p className="text-xs text-muted-foreground">{t("ops.upload.queueDesc")}</p>
                </div>
                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Clock className="h-7 w-7 text-muted-foreground/40" />
                    <p className="mt-2 text-sm font-medium">{t("ops.upload.queueEmpty")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("ops.upload.queueEmptyHint")}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {queue.map((item) => (
                      <QueueCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </DataCard>
            </TabsContent>

            {/* ── Live Results Tab ── */}
            <TabsContent value="results">
              <DataCard>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">{t("ops.upload.liveTitle")}</h2>
                    <p className="text-xs text-muted-foreground">{t("ops.upload.liveDesc")}</p>
                  </div>
                  {liveResults.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Pill tone="blue">{t("ops.upload.nDetected", { n: liveResults.length })}</Pill>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setLiveResults([])}>{t("ops.upload.clearAll")}</Button>
                    </div>
                  )}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-14 pl-4" />
                      <TableHead>{t("ops.upload.type")}</TableHead>
                      <TableHead>{t("ops.upload.confidence")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("ops.upload.frame")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("ops.upload.location")}</TableHead>
                      <TableHead className="w-12 pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveResults.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-28 text-center">
                          <ImageIcon className="mx-auto h-7 w-7 text-muted-foreground/40" />
                          <p className="mt-2 text-sm font-medium">{t("ops.upload.liveEmpty")}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{t("ops.upload.liveEmptyHint")}</p>
                        </TableCell>
                      </TableRow>
                    ) : liveResults.map((det) => (
                      <TableRow key={det.id} className="h-11">
                        <TableCell className="py-1.5 pl-4">
                          {det.crop_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveMinioUrl(det.crop_url) ?? ""}
                              alt={t("ops.upload.cropAlt")}
                              className="h-7 w-10 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-7 w-10 shrink-0 items-center justify-center rounded bg-muted">
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 font-medium capitalize">{typeLabel(det.type)}{det.subtype && <span className="normal-case"> / {subtypeText(det.type, det.subtype, lang)}</span>}</TableCell>
                        <TableCell className="py-1.5 tabular-nums">{Math.round(det.confidence * 100)}%</TableCell>
                        <TableCell className="hidden py-1.5 font-mono text-xs text-muted-foreground sm:table-cell">#{det.frame_number}</TableCell>
                        <TableCell className="hidden max-w-[260px] truncate py-1.5 md:table-cell">
                          {det.location_name
                            ? det.location_name
                            : det.latitude != null
                            ? `${det.latitude.toFixed(4)}, ${det.longitude?.toFixed(4)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="py-1.5 pr-4 text-right">
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setLiveResults((prev) => prev.filter((d) => d.id !== det.id))}
                            aria-label={t("ops.upload.dismiss")}
                            title={t("ops.upload.dismiss")}
                          ><XCircle className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </DataCard>
            </TabsContent>
          </Tabs>
        </div>
        </RequirePermission>
      </main>

      {/* stripe animation */}
      <style jsx global>{`
        @keyframes stripe-move {
          from { background-position: 0 0; }
          to   { background-position: 40px 0; }
        }
        @keyframes pending-slide {
          0%   { left: -33%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  )
}

function StatusBadge({ status }: { status: JobStatus }) {
  const t = useT()
  const map: Record<JobStatus, { label: string; tone: BadgeTone }> = {
    uploading:  { label: t("ops.upload.uploading"), tone: "blue" },
    pending:    { label: t("ops.status.pending"), tone: "amber" },
    processing: { label: t("ops.status.processing"), tone: "blue" },
    done:       { label: t("ops.status.done"), tone: "green" },
    failed:     { label: t("ops.status.failed"), tone: "red" },
    cancelled:  { label: t("ops.status.cancelled"), tone: "slate" },
  }
  const { label, tone } = map[status]
  return <Pill tone={tone} className="shrink-0">{label}</Pill>
}

const QueueCard = memo(function QueueCard({ item }: { item: QueueItem }) {
  const { t, locale } = useI18n()
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
        <FileVideo className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{item.filename}</p>
          <div className="flex items-center gap-2 shrink-0">
            {item.jobId && (
              <Link href={`/jobs?job=${encodeURIComponent(item.jobId)}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" />{t("m7.upload.viewJob")}
              </Link>
            )}
            <StatusBadge status={item.status} />
          </div>
        </div>
        <ModelBadges modelIds={item.selectedModels} />

        {item.status === "uploading" && (
          <div className="space-y-1">
            <div className="relative h-2 overflow-hidden rounded-full bg-primary/15">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${item.progress}%` }}
              />
              <div
                className="absolute inset-0 rounded-full opacity-20"
                style={{
                  backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.6) 6px, rgba(255,255,255,0.6) 12px)",
                  backgroundSize: "20px 20px",
                  animation: "stripe-move 1s linear infinite",
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("ops.upload.uploadingDots")}</span>
              <span className="tabular-nums font-medium">{item.progress}%</span>
            </div>
          </div>
        )}

        {item.status === "pending" && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted relative">
              <div className="absolute inset-y-0 w-1/3 rounded-full bg-warning/60"
                style={{ animation: "pending-slide 1.5s ease-in-out infinite" }} />
            </div>
            <p className="text-xs text-muted-foreground">{t("ops.upload.waitingWorker")}</p>
          </div>
        )}

        {item.status === "processing" && (
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Progress value={item.progress} className="flex-1 h-2" />
              <span className="text-xs tabular-nums font-medium w-10 text-right">
                {item.progress}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {item.processedFrames > 0
                  ? t("ops.jobs.frames", { done: item.processedFrames.toLocaleString(locale), total: item.totalFrames.toLocaleString(locale) })
                  : t("ops.upload.aiProcessing")}
              </span>
              {item.detectionCount > 0 && (
                <span className="text-primary font-medium">{t("ops.upload.nDetected", { n: item.detectionCount })}</span>
              )}
            </div>
          </div>
        )}

        {item.status === "done" && (
          <p className="text-xs text-muted-foreground">
            {t(item.detectionCount !== 1 ? "ops.upload.completedMany" : "ops.upload.completedOne", { n: item.detectionCount })}
          </p>
        )}
        {item.status === "cancelled" && (
          <p className="text-xs text-muted-foreground">{t("m7.upload.cancelled")}</p>
        )}
        {item.status === "failed" && item.error && (
          <p className="text-xs text-destructive">{item.error}</p>
        )}
      </div>

      <div className="mt-1.5 shrink-0">
        {item.status === "uploading" || item.status === "pending" || item.status === "processing"
          ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
          : item.status === "done"
          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          : item.status === "cancelled"
          ? <Ban className="h-4 w-4 text-muted-foreground" />
          : <XCircle className="h-4 w-4 text-destructive" />}
      </div>
    </div>
  )
})
