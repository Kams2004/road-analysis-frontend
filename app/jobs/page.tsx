"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Briefcase, RefreshCw, Search, FileVideo, CheckCircle2,
  XCircle, Loader2, Clock, ChevronLeft, ChevronRight, Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchJobs, deleteJob, type JobOut } from "@/lib/api"
import { formatDistanceToNow, format } from "date-fns"

const PAGE_SIZE = 20

const STATUS_MAP: Record<JobOut["status"], { label: string; className: string; icon: React.ReactNode }> = {
  pending:    { label: "Queued",     className: "bg-warning/10 text-warning border-warning/30",         icon: <Clock className="h-3.5 w-3.5" /> },
  processing: { label: "Processing", className: "bg-primary/10 text-primary border-primary/30",         icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  done:       { label: "Done",       className: "bg-success/10 text-success border-success/30",         icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  failed:     { label: "Failed",     className: "bg-destructive/10 text-destructive border-destructive/30", icon: <XCircle className="h-3.5 w-3.5" /> },
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [jobToDelete, setJobToDelete] = useState<JobOut | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchJobs(0, 200)
      setJobs(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load jobs")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh silently while any job is active — no loading flash
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "pending" || j.status === "processing")
    if (!hasActive) return
    const t = setTimeout(() => load(true), 3000)
    return () => clearTimeout(t)
  }, [jobs, load])

  const handleDelete = async () => {
    if (!jobToDelete) return
    setDeleting(true)
    try {
      await deleteJob(jobToDelete.id)
      setJobs((prev) => prev.filter((j) => j.id !== jobToDelete.id))
      setJobToDelete(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete job")
    } finally {
      setDeleting(false)
    }
  }

  const filtered = jobs.filter((j) => {
    if (statusFilter !== "all" && j.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return j.filename.toLowerCase().includes(q) || j.id.toLowerCase().includes(q)
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const counts = {
    all: jobs.length,
    pending: jobs.filter((j) => j.status === "pending").length,
    processing: jobs.filter((j) => j.status === "processing").length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Jobs</h1>
              <p className="mt-1 text-muted-foreground">All video processing jobs and their status</p>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {/* Stats row */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(["all", "pending", "processing", "done", "failed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                  statusFilter === s ? "border-primary bg-primary/5" : "border-border bg-card"
                )}
              >
                <p className="text-2xl font-bold">{counts[s]}</p>
                <p className="text-xs text-muted-foreground capitalize">{s === "all" ? "Total" : s}</p>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by filename or job ID…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Queued</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>File</TableHead>
                  <TableHead>Models</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-44">Progress</TableHead>
                  <TableHead className="hidden sm:table-cell">Detections</TableHead>
                  <TableHead className="hidden md:table-cell">Submitted</TableHead>
                  <TableHead className="hidden lg:table-cell">Finished</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && jobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && paginated.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Briefcase className="mx-auto h-8 w-8 text-muted-foreground/40" />
                      <p className="mt-2 text-sm text-muted-foreground">No jobs found</p>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && paginated.map((job) => {
                  const pct = job.total_frames > 0
                    ? Math.round((job.processed / job.total_frames) * 100)
                    : job.status === "done" ? 100 : 0
                  const models = job.enabled_models ? job.enabled_models.split(",") : []
                  const s = STATUS_MAP[job.status]
                  return (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <FileVideo className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium max-w-[180px]">{job.filename}</p>
                            <p className="text-xs text-muted-foreground font-mono">{job.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {models.map((m) => (
                            <Badge key={m} variant="outline" className="text-xs capitalize px-1.5 py-0">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("gap-1 text-xs", s.className)}>
                          {s.icon}{s.label}
                        </Badge>
                        {job.error && (
                          <p className="mt-1 text-xs text-destructive truncate max-w-[160px]" title={job.error}>
                            {job.error}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.status === "processing" || job.status === "done" ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="flex-1 h-1.5" />
                              <span className="text-xs tabular-nums w-8 text-right">{pct}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {job.processed.toLocaleString()} / {job.total_frames.toLocaleString()} frames
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className={cn("font-medium text-sm", job.detections > 0 ? "text-primary" : "text-muted-foreground")}>
                          {job.detections}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(job.created_at + "Z"), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {job.finished_at
                          ? format(new Date(job.finished_at + "Z"), "dd MMM, HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setJobToDelete(job)}
                          title="Delete job"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {filtered.length} jobs · page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <AlertDialog open={!!jobToDelete} onOpenChange={(o) => { if (!o) setJobToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete
              {" "}<span className="font-medium text-foreground">{jobToDelete?.filename}</span>{" "}
              and all its detections and validation labels. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
