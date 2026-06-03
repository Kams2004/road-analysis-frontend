"use client"

import { useState, useEffect, useMemo } from "react"
import Image from "next/image"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Clock, CheckCircle, XCircle, Eye, Search, Filter, MapPin,
  ImageIcon, Video, AlertTriangle, ChevronLeft, ChevronRight, Edit2, Save, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import {
  fetchDetections, reviewDetection, correctLocation,
  resolveMinioUrl, type ApiDetection,
} from "@/lib/api"

const PAGE_SIZE = 15

// Labels per detection type
const TYPE_LABELS: Record<string, string[]> = {
  pothole:      ["pothole"],
  traffic_sign: ["speed_limit", "stop", "yield", "no_entry", "warning", "direction", "other"],
  speed_bump:   ["speed_bump"],
  default:      ["confirmed"],
}

const statusColors = {
  pending:   "bg-warning/20 text-warning border-warning/30",
  validated: "bg-success/20 text-success border-success/30",
  rejected:  "bg-destructive/20 text-destructive border-destructive/30",
}

export default function ValidationsPage() {
  const [detections, setDetections] = useState<ApiDetection[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [page, setPage]             = useState(1)
  const [statusFilter, setStatusFilter] = useState("pending")
  const [typeFilter, setTypeFilter]     = useState("all")
  const [search, setSearch]             = useState("")
  const [selected, setSelected]         = useState<ApiDetection | null>(null)
  const [busy, setBusy]                 = useState(false)

  // Counts
  const [counts, setCounts] = useState({ pending: 0, validated: 0, rejected: 0 })

  // Validation form state
  const [label, setLabel]                 = useState("")
  const [severityScore, setSeverityScore] = useState<string>("")
  const [rejectNote, setRejectNote]       = useState("")
  const [showReject, setShowReject]       = useState(false)

  // GPS correction state
  const [editingGps, setEditingGps]   = useState(false)
  const [rawGpsInput, setRawGpsInput] = useState("")
  const [gpsError, setGpsError]       = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetchDetections({ review_status: "pending",   limit: 1 }),
      fetchDetections({ review_status: "validated", limit: 1 }),
      fetchDetections({ review_status: "rejected",  limit: 1 }),
    ]).then(([p, v, r]) => setCounts({ pending: p.total, validated: v.total, rejected: r.total }))
  }, [detections])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const params: Parameters<typeof fetchDetections>[0] = {
      skip: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }
    if (statusFilter !== "all") params.review_status = statusFilter
    fetchDetections(params)
      .then((d) => { setDetections(d.items); setTotal(d.total) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [page, statusFilter])

  const filtered = useMemo(() => detections.filter((d) => {
    if (typeFilter !== "all" && d.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return d.id.toLowerCase().includes(q) || d.type.toLowerCase().includes(q) ||
        (d.location_name ?? "").toLowerCase().includes(q)
    }
    return true
  }), [detections, typeFilter, search])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function openDetail(d: ApiDetection) {
    setSelected(d)
    setShowReject(false)
    setRejectNote("")
    setLabel(TYPE_LABELS[d.type]?.[0] ?? "confirmed")
    setSeverityScore(d.type === "pothole" ? "0" : "")
    setEditingGps(false)
    setRawGpsInput(d.raw_gps_text ?? "")
    setGpsError(null)
  }

  function updateLocal(updated: ApiDetection) {
    setDetections((prev) => prev.map((d) => d.id === updated.id ? updated : d))
    setSelected(updated)
  }

  async function handleSaveGps() {
    if (!selected) return
    setBusy(true)
    setGpsError(null)
    try {
      const updated = await correctLocation(selected.id, rawGpsInput)
      updateLocal(updated)
      setEditingGps(false)
    } catch (e: unknown) {
      setGpsError(e instanceof Error ? e.message : "GPS update failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleValidate() {
    if (!selected) return
    setBusy(true)
    try {
      const opts: Parameters<typeof reviewDetection>[2] = { label }
      if (selected.type === "pothole") opts.severity_score = parseInt(severityScore)
      const updated = await reviewDetection(selected.id, "validated", opts)
      updateLocal(updated)
      setSelected(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Validation failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    if (!selected) return
    setBusy(true)
    try {
      const updated = await reviewDetection(selected.id, "rejected", { note: rejectNote })
      updateLocal(updated)
      setSelected(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Rejection failed")
    } finally {
      setBusy(false)
    }
  }

  // Quick actions from table row
  async function quickReview(d: ApiDetection, status: "validated" | "rejected") {
    setBusy(true)
    try {
      const opts: Parameters<typeof reviewDetection>[2] = {}
      if (status === "validated") {
        opts.label = TYPE_LABELS[d.type]?.[0] ?? "confirmed"
        if (d.type === "pothole") opts.severity_score = 0
      }
      const updated = await reviewDetection(d.id, status, opts)
      setDetections((prev) => prev.map((x) => x.id === updated.id ? updated : x))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  const canValidate = selected && selected.latitude != null && selected.longitude != null
  const availableLabels = TYPE_LABELS[selected?.type ?? ""] ?? TYPE_LABELS.default

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Validate Risk Zones</h1>
            <p className="mt-1 text-muted-foreground">Review AI detections and confirm valid road hazards</p>
          </div>

          {/* Stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {([
              { label: "Pending Review", value: counts.pending,   Icon: Clock,         color: "bg-warning/10",     ic: "text-warning" },
              { label: "Validated",      value: counts.validated, Icon: CheckCircle,   color: "bg-success/10",     ic: "text-success" },
              { label: "Rejected",       value: counts.rejected,  Icon: XCircle,       color: "bg-destructive/10", ic: "text-destructive" },
            ] as const).map(({ label, value, Icon, color, ic }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg", color)}>
                    <Icon className={cn("h-6 w-6", ic)} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Table card */}
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">Detections</h2>
              <p className="text-sm text-muted-foreground">Click the eye icon to review and validate or reject</p>
            </div>

            {/* Filters */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="w-36"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="validated">Validated</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="pothole">Pothole</SelectItem>
                  <SelectItem value="traffic_sign">Traffic Sign</SelectItem>
                  <SelectItem value="speed_bump">Speed Bump</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Showing {filtered.length} of {total}</span>
              <span>Page {page} of {totalPages || 1}</span>
            </div>

            {error && <p className="text-destructive text-sm mb-3">{error}</p>}

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-20">Frame</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead className="hidden lg:table-cell">GPS</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  )}
                  {!loading && filtered.map((d) => {
                    const img = resolveMinioUrl(d.image_url)
                    const hasGps = d.latitude != null
                    return (
                      <TableRow key={d.id} className="group">
                        <TableCell>
                          <div className="relative h-12 w-16 rounded overflow-hidden bg-muted">
                            {img
                              ? <Image src={img} alt="" fill className="object-cover" unoptimized />
                              : <div className="flex h-full items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                            }
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium capitalize">{d.type.replace("_", " ")}</div>
                          <div className="text-xs text-muted-foreground">{d.id.slice(0, 8)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${d.confidence * 100}%` }} />
                            </div>
                            <span className="text-sm">{Math.round(d.confidence * 100)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="truncate max-w-[150px]">{d.location_name ?? "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {hasGps
                            ? <span className="text-xs text-success">{d.latitude!.toFixed(4)}, {d.longitude!.toFixed(4)}</span>
                            : <span className="text-xs text-destructive font-medium">⚠ No GPS</span>
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("capitalize", statusColors[d.review_status])}>
                            {d.review_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(d)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {d.review_status === "pending" && (
                              <>
                                <Button variant="ghost" size="icon"
                                  className="h-8 w-8 text-success hover:bg-success/10"
                                  disabled={busy || !hasGps}
                                  title={!hasGps ? "Set GPS before validating" : "Validate"}
                                  onClick={() => quickReview(d, "validated")}>
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  disabled={busy}
                                  onClick={() => quickReview(d, "rejected")}>
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {!loading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                        <p className="mt-2 text-sm text-muted-foreground">No detections found</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Detail / Validation Modal ── */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 capitalize">
                  {selected.type.replace("_", " ")}
                  <Badge variant="outline" className={statusColors[selected.review_status]}>
                    {selected.review_status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>ID: {selected.id.slice(0, 8)} · Frame #{selected.frame_number}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5">

                {/* Annotated frame */}
                {resolveMinioUrl(selected.image_url) ? (
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    <Image src={resolveMinioUrl(selected.image_url)!} alt="frame" fill className="object-contain" unoptimized />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                    <ImageIcon className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}

                {/* Crop */}
                {resolveMinioUrl(selected.crop_url) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Crop</p>
                    <div className="relative h-28 w-40 rounded-lg overflow-hidden bg-muted">
                      <Image src={resolveMinioUrl(selected.crop_url)!} alt="crop" fill className="object-contain" unoptimized />
                    </div>
                  </div>
                )}

                {/* Context clip — shown when GPS was missing */}
                {resolveMinioUrl(selected.context_clip_url) && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Video className="h-3.5 w-3.5" /> Context Clip (±3s)
                    </p>
                    <video controls className="w-full rounded-lg bg-black max-h-48"
                      src={resolveMinioUrl(selected.context_clip_url)!} />
                  </div>
                )}

                {/* GPS section */}
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">GPS Coordinates</p>
                    {selected.review_status === "pending" && !editingGps && (
                      <Button variant="ghost" size="sm" onClick={() => { setEditingGps(true); setRawGpsInput(selected.raw_gps_text ?? "") }}>
                        <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                    )}
                  </div>

                  {selected.latitude != null ? (
                    <p className="text-sm text-success font-medium">
                      {selected.latitude.toFixed(6)}, {selected.longitude?.toFixed(6)}
                    </p>
                  ) : (
                    <p className="text-sm text-destructive font-medium">⚠ Missing — must be set before validation</p>
                  )}

                  {editingGps && (
                    <div className="space-y-2">
                      <Label className="text-xs">Raw GPS text (NMEA format)</Label>
                      <p className="text-xs text-muted-foreground">e.g. 0515.4260,N,01013.5383,E,028KM/H</p>
                      <Input value={rawGpsInput} onChange={(e) => setRawGpsInput(e.target.value)}
                        placeholder="DDMM.MMMM,N,DDDMM.MMMM,E,SSSKMH" />
                      {gpsError && <p className="text-xs text-destructive">{gpsError}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busy || !rawGpsInput} onClick={handleSaveGps}>
                          <Save className="h-3.5 w-3.5 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingGps(false); setGpsError(null) }}>
                          <X className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {selected.raw_gps_text && !editingGps && (
                    <div>
                      <p className="text-xs text-muted-foreground">Raw OCR text</p>
                      <code className="text-xs bg-muted px-2 py-0.5 rounded">{selected.raw_gps_text}</code>
                    </div>
                  )}
                </div>

                {/* Details grid */}
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Confidence</p><p>{Math.round(selected.confidence * 100)}%</p></div>
                  {selected.subtype && <div><p className="text-xs text-muted-foreground">Subtype</p><p>{selected.subtype}</p></div>}
                  {selected.speed_kmh != null && <div><p className="text-xs text-muted-foreground">Speed</p><p>{selected.speed_kmh} km/h</p></div>}
                  {selected.captured_at && (
                    <div><p className="text-xs text-muted-foreground">Captured</p><p>{format(new Date(selected.captured_at), "PPpp")}</p></div>
                  )}
                  {selected.location_name && (
                    <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Location</p><p>{selected.location_name}</p></div>
                  )}
                </div>

                {/* Validation form — only for pending */}
                {selected.review_status === "pending" && (
                  <div className="space-y-4 border-t pt-4">

                    {!showReject ? (
                      <>
                        {/* Label selector */}
                        <div className="space-y-1.5">
                          <Label>Label <span className="text-destructive">*</span></Label>
                          <Select value={label} onValueChange={setLabel}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {availableLabels.map((l) => (
                                <SelectItem key={l} value={l}>{l.replace("_", " ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Severity — required for pothole */}
                        {selected.type === "pothole" && (
                          <div className="space-y-1.5">
                            <Label>Severity Score (0–3) <span className="text-destructive">*</span></Label>
                            <Select value={severityScore} onValueChange={setSeverityScore}>
                              <SelectTrigger><SelectValue placeholder="Select severity" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0 — Minor</SelectItem>
                                <SelectItem value="1">1 — Moderate</SelectItem>
                                <SelectItem value="2">2 — Severe</SelectItem>
                                <SelectItem value="3">3 — Critical</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {!canValidate && (
                          <p className="text-sm text-destructive bg-destructive/10 rounded p-3">
                            ⚠ GPS coordinates are missing. Set the GPS text above to enable validation.
                          </p>
                        )}

                        <div className="flex gap-3">
                          <Button className="flex-1 bg-success hover:bg-success/90 text-white"
                            disabled={busy || !canValidate || !label || (selected.type === "pothole" && !severityScore)}
                            onClick={handleValidate}>
                            <CheckCircle className="mr-2 h-4 w-4" /> Validate
                          </Button>
                          <Button variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => setShowReject(true)}>
                            <XCircle className="mr-2 h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <Label>Rejection reason (optional)</Label>
                        <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                          placeholder="Describe why this detection is a false positive..." rows={3} />
                        <div className="flex gap-3">
                          <Button variant="destructive" className="flex-1" disabled={busy} onClick={handleReject}>
                            <XCircle className="mr-2 h-4 w-4" /> Confirm Reject
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={() => setShowReject(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Already reviewed info */}
                {selected.review_status !== "pending" && selected.reviewed_at && (
                  <div className="border-t pt-4 text-sm text-muted-foreground space-y-1">
                    <p>Reviewed by <span className="font-medium text-foreground">{selected.reviewed_by}</span></p>
                    <p>{format(new Date(selected.reviewed_at), "PPpp")}</p>
                    {selected.review_note && <p className="italic">"{selected.review_note}"</p>}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
