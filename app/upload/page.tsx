"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  Upload, FileVideo, ImageIcon, Loader2, CheckCircle2, XCircle, Play, Trash2, Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sidebar } from "@/components/sidebar"
import { ModelSelector, ModelBadges, AVAILABLE_MODELS } from "@/components/model-selector"
import { submitJob, getJob, fetchDetections, resolveMinioUrl } from "@/lib/api"
import type { JobOut, ApiDetection } from "@/lib/api"
import { cn } from "@/lib/utils"

const MODEL_MAP: Record<string, string> = {
  potholes: "pothole",
  traffic_lights: "signs",
  speed_hump: "speedbump",
}

interface StagedFile {
  id: string
  file: File
  previewUrl: string
  isImage: boolean
}

type JobStatus = "uploading" | "pending" | "processing" | "done" | "failed"

interface QueueItem {
  id: string
  filename: string
  selectedModels: string[]
  jobId?: string
  status: JobStatus
  progress: number
  error?: string
}

interface LiveDetection extends ApiDetection {
  _jobId: string
}

const POLL_MS = 2000

export default function UploadPage() {
  const [selectedModels, setSelectedModels] = useState<string[]>(
    AVAILABLE_MODELS.map((m) => m.id)
  )
  const [isDragging, setIsDragging] = useState(false)
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [liveResults, setLiveResults] = useState<LiveDetection[]>([])
  const [activeTab, setActiveTab] = useState("upload")
  const pollTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const seenDetections = useRef<Set<string>>(new Set())

  useEffect(() => {
    const timers = pollTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      staged.forEach((s) => URL.revokeObjectURL(s.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const startPolling = useCallback((queueId: string, jobId: string) => {
    if (pollTimers.current.has(queueId)) return

    const tick = async () => {
      try {
        const job: JobOut = await getJob(jobId)
        const pct = job.total_frames > 0
          ? Math.round((job.processed / job.total_frames) * 100)
          : job.status === "done" ? 100 : 0

        setQueue((prev) =>
          prev.map((q) =>
            q.id === queueId
              ? { ...q, status: job.status as JobStatus, progress: pct, error: job.error ?? undefined }
              : q
          )
        )

        try {
          const det = await fetchDetections({ skip: 0, limit: 200 })
          const fresh = det.items.filter((d) => d.job_id === jobId && !seenDetections.current.has(d.id))
          if (fresh.length) {
            fresh.forEach((d) => seenDetections.current.add(d.id))
            setLiveResults((prev) => [...fresh.map((d) => ({ ...d, _jobId: jobId })), ...prev])
          }
        } catch { /* non-fatal */ }

        if (job.status === "pending" || job.status === "processing") {
          pollTimers.current.set(queueId, setTimeout(tick, POLL_MS))
        } else {
          pollTimers.current.delete(queueId)
          // When job is done, remove its live detections after 5s then clear queue item
          if (job.status === "done") {
            setTimeout(() => {
              setLiveResults((prev) => prev.filter((d) => d._jobId !== jobId))
            }, 5000)
          }
          setTimeout(() => setQueue((prev) => prev.filter((q) => q.id !== queueId)), 5000)
        }
      } catch (e) {
        setQueue((prev) =>
          prev.map((q) => q.id === queueId ? { ...q, status: "failed", error: String(e) } : q)
        )
        pollTimers.current.delete(queueId)
      }
    }

    pollTimers.current.set(queueId, setTimeout(tick, POLL_MS))
  }, [])

  const submitAll = async () => {
    if (staged.length === 0 || selectedModels.length === 0) return
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
      }
      setQueue((prev) => [...prev, item])

      try {
        const backendModels = selectedModels.map((m) => MODEL_MAP[m] ?? m)
        const job = await submitJob(s.file, backendModels)
        setQueue((prev) =>
          prev.map((q) => q.id === qId ? { ...q, jobId: job.id, status: job.status as JobStatus } : q)
        )
        startPolling(qId, job.id)
      } catch (e) {
        setQueue((prev) =>
          prev.map((q) => q.id === qId ? { ...q, status: "failed", error: String(e) } : q)
        )
      }
    }
  }

  const activeQueue = queue.filter((q) => q.status !== "done" && q.status !== "failed")

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Upload Video Files</h1>
            <p className="mt-1 text-muted-foreground">
              Select detection models and upload video files for analysis
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-muted">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="queue" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Processing Queue
                {activeQueue.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {activeQueue.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="results" className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Results
                {liveResults.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {liveResults.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Upload Tab */}
            <TabsContent value="upload" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Select Models & Files</CardTitle>
                  <CardDescription>Choose detection models then upload video or image files</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ModelSelector selectedModels={selectedModels} onSelectionChange={setSelectedModels} />

                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-all",
                      isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
                      selectedModels.length === 0 && "opacity-50 pointer-events-none"
                    )}
                  >
                    <input
                      type="file"
                      accept="video/*,image/*"
                      multiple
                      onChange={(e) => stageFiles(e.target.files)}
                      disabled={selectedModels.length === 0}
                      className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                      <Upload className="h-7 w-7 text-primary" />
                    </div>
                    <p className="mt-3 text-base font-medium">Drop files here or click to select</p>
                    <p className="mt-1 text-sm text-muted-foreground">Video (MP4, AVI, MOV, MKV) or Image (JPG, PNG)</p>
                  </div>

                  {staged.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Selected files ({staged.length})</p>
                        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => {
                          staged.forEach((s) => URL.revokeObjectURL(s.previewUrl))
                          setStaged([])
                        }}>
                          Remove all
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {staged.map((s) => (
                          <div key={s.id} className="group relative rounded-lg border border-border overflow-hidden bg-muted/30">
                            {s.isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.previewUrl} alt={s.file.name} className="w-full h-40 object-cover" />
                            ) : (
                              <video src={s.previewUrl} className="w-full h-40 object-cover" controls preload="metadata" />
                            )}
                            <div className="px-3 py-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-medium truncate">{s.file.name}</p>
                              <Button
                                variant="ghost" size="icon"
                                className="h-6 w-6 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => removeStaged(s.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Button className="w-full gap-2" onClick={submitAll} disabled={selectedModels.length === 0}>
                        <Play className="h-4 w-4" />
                        Analyse {staged.length} file{staged.length > 1 ? "s" : ""} with selected models
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Processing Queue Tab */}
            <TabsContent value="queue" className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Processing Queue</h2>
                <p className="text-sm text-muted-foreground">Upload and processing progress per file</p>
              </div>

              {queue.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <Clock className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-sm font-medium">No jobs in queue</p>
                    <p className="mt-1 text-sm text-muted-foreground">Upload files to start processing</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {queue.map((item) => (
                    <div key={item.id} className="flex items-start gap-4 rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileVideo className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm truncate">{item.filename}</p>
                          <StatusBadge status={item.status} />
                        </div>
                        <ModelBadges modelIds={item.selectedModels} />

                        {(item.status === "uploading" || item.status === "pending" || item.status === "processing") && (
                          <div className="pt-1 space-y-1">
                            {item.status === "uploading" ? (
                              <div className="h-2 rounded-full bg-primary/20 overflow-hidden">
                                <div className="h-full w-2/5 bg-primary rounded-full animate-pulse" />
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <Progress value={item.progress} className="flex-1 h-2" />
                                <span className="text-sm text-muted-foreground w-10 text-right tabular-nums">
                                  {item.progress}%
                                </span>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {item.status === "uploading" ? "Uploading file…"
                                : item.status === "pending" ? "Queued — waiting for worker…"
                                : "AI models processing frames…"}
                            </p>
                          </div>
                        )}

                        {item.status === "failed" && item.error && (
                          <p className="text-xs text-destructive">{item.error}</p>
                        )}
                        {item.status === "done" && (
                          <p className="text-xs text-muted-foreground">Completed — results saved to database</p>
                        )}
                      </div>
                      <div className="shrink-0 mt-0.5">
                        {item.status === "uploading" || item.status === "pending" || item.status === "processing"
                          ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          : item.status === "done"
                          ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                          : <XCircle className="h-5 w-5 text-destructive" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Live Results Tab */}
            <TabsContent value="results" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Live Detection Results</h2>
                  <p className="text-sm text-muted-foreground">
                    Real-time detections as frames are processed — disappear when job completes
                  </p>
                </div>
                {liveResults.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      {liveResults.length} detected
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setLiveResults([])}>
                      Clear all
                    </Button>
                  </div>
                )}
              </div>

              {liveResults.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                      <ImageIcon className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-sm font-medium">No live results yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Detections will appear here in real-time while frames are being processed
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {liveResults.map((det) => (
                    <div
                      key={det.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3"
                    >
                      {det.crop_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveMinioUrl(det.crop_url) ?? ""}
                          alt="detection crop"
                          className="h-12 w-16 rounded object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-16 rounded bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Type</p>
                          <p className="font-medium capitalize">{det.type}{det.subtype ? ` / ${det.subtype}` : ""}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Confidence</p>
                          <p className="font-medium">{Math.round(det.confidence * 100)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Frame</p>
                          <p className="font-medium">#{det.frame_number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">GPS</p>
                          <p className="font-medium truncate">
                            {det.latitude != null && det.longitude != null
                              ? `${det.latitude.toFixed(4)}, ${det.longitude.toFixed(4)}`
                              : "—"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setLiveResults((prev) => prev.filter((d) => d.id !== det.id))}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; className: string }> = {
    uploading:  { label: "Uploading",  className: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
    pending:    { label: "Queued",     className: "bg-warning/10 text-warning border-warning/30" },
    processing: { label: "Processing", className: "bg-primary/10 text-primary border-primary/30" },
    done:       { label: "Done",       className: "bg-green-500/10 text-green-600 border-green-500/30" },
    failed:     { label: "Failed",     className: "bg-destructive/10 text-destructive border-destructive/30" },
  }
  const { label, className } = map[status]
  return <Badge variant="outline" className={cn("shrink-0 text-xs", className)}>{label}</Badge>
}
