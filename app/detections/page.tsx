"use client"

import { useState, useEffect, useMemo } from "react"
import Image from "next/image"
import { Sidebar } from "@/components/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Search, Filter, MapPin, ImageIcon, Video, AlertTriangle,
  ChevronLeft, ChevronRight, Eye, CheckCircle, XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { fetchDetections, resolveMinioUrl, type ApiDetection } from "@/lib/api"

const PAGE_SIZE = 15

const statusColors: Record<string, string> = {
  pending:   "bg-warning/20 text-warning border-warning/30",
  validated: "bg-success/20 text-success border-success/30",
  rejected:  "bg-destructive/20 text-destructive border-destructive/30",
  resolved:  "bg-blue-500/20 text-blue-500 border-blue-500/30",
}

const severityLabel = ["Minor", "Moderate", "Severe", "Critical"]
const severityColor = [
  "bg-info/20 text-info border-info/30",
  "bg-warning/20 text-warning border-warning/30",
  "bg-chart-3/20 text-chart-3 border-chart-3/30",
  "bg-destructive/20 text-destructive border-destructive/30",
]

export default function DetectionsPage() {
  const [detections, setDetections] = useState<ApiDetection[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [page, setPage]             = useState(1)
  const [statusFilter, setStatusFilter] = useState("validated")
  const [typeFilter, setTypeFilter]     = useState("all")
  const [search, setSearch]             = useState("")
  const [selected, setSelected]         = useState<ApiDetection | null>(null)

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
        (d.location_name ?? "").toLowerCase().includes(q) ||
        (d.subtype ?? "").toLowerCase().includes(q)
    }
    return true
  }), [detections, typeFilter, search])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">All Detections</h1>
            <p className="mt-1 text-muted-foreground">Validated and rejected road hazard detections</p>
          </div>

          <div className="rounded-xl border bg-card p-6">
            {/* Filters */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search by ID, type, location..." value={search}
                  onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="w-36"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="validated">Validated</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All (incl. pending)</SelectItem>
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
                    <TableHead>Severity</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="hidden md:table-cell">Location / GPS</TableHead>
                    <TableHead className="hidden lg:table-cell">Reviewed by</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  )}
                  {!loading && filtered.map((d) => {
                    const img = resolveMinioUrl(d.image_url)
                    const sev = d.type === "pothole" && d.subtype != null ? parseInt(d.subtype) : null
                    return (
                      <TableRow key={d.id}>
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
                          {d.subtype && d.type !== "pothole" && (
                            <div className="text-xs text-muted-foreground capitalize">{d.subtype.replace("_", " ")}</div>
                          )}
                          <div className="text-xs text-muted-foreground">{d.id.slice(0, 8)}</div>
                        </TableCell>
                        <TableCell>
                          {sev !== null && !isNaN(sev) ? (
                            <Badge variant="outline" className={cn("text-xs", severityColor[sev])}>
                              {severityLabel[sev]}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
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
                          {d.latitude != null && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {d.latitude.toFixed(4)}, {d.longitude?.toFixed(4)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {d.reviewed_by ?? "—"}
                          {d.reviewed_at && (
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(d.reviewed_at), "MMM d, HH:mm")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("capitalize", statusColors[d.review_status])}>
                            {d.review_status === "validated" ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                            {d.review_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(d)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {!loading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
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

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (() => {
            const sev = selected.type === "pothole" && selected.subtype != null ? parseInt(selected.subtype) : null
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 capitalize">
                    {selected.type.replace("_", " ")}
                    <Badge variant="outline" className={statusColors[selected.review_status]}>
                      {selected.review_status}
                    </Badge>
                    {sev !== null && !isNaN(sev) && (
                      <Badge variant="outline" className={severityColor[sev]}>{severityLabel[sev]}</Badge>
                    )}
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

                  {/* Context clip */}
                  {resolveMinioUrl(selected.context_clip_url) && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <Video className="h-3.5 w-3.5" /> Context Clip (±3s)
                      </p>
                      <video
                        controls
                        preload="metadata"
                        className="w-full rounded-lg bg-black"
                        style={{ maxHeight: 240 }}
                      >
                        <source src={resolveMinioUrl(selected.context_clip_url)!} type="video/mp4" />
                      </video>
                    </div>
                  )}

                  {/* Details */}
                  <div className="grid gap-3 sm:grid-cols-2 text-sm rounded-lg border p-4">
                    <div><p className="text-xs text-muted-foreground">Confidence</p><p>{Math.round(selected.confidence * 100)}%</p></div>
                    <div><p className="text-xs text-muted-foreground">Type</p><p className="capitalize">{selected.type.replace("_", " ")}</p></div>
                    {selected.subtype && (
                      <div><p className="text-xs text-muted-foreground">{selected.type === "pothole" ? "Severity score" : "Sign type"}</p>
                        <p className="capitalize">{selected.type === "pothole" && sev !== null && !isNaN(sev)
                          ? `${sev} — ${severityLabel[sev]}` : selected.subtype.replace("_", " ")}</p>
                      </div>
                    )}
                    {selected.latitude != null && (
                      <div><p className="text-xs text-muted-foreground">GPS</p>
                        <p>{selected.latitude.toFixed(6)}, {selected.longitude?.toFixed(6)}</p></div>
                    )}
                    {selected.location_name && (
                      <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Location</p>
                        <p>{selected.location_name}</p></div>
                    )}
                    {selected.speed_kmh != null && (
                      <div><p className="text-xs text-muted-foreground">Speed</p><p>{selected.speed_kmh} km/h</p></div>
                    )}
                    {selected.captured_at && (
                      <div><p className="text-xs text-muted-foreground">Captured</p>
                        <p>{format(new Date(selected.captured_at), "PPpp")}</p></div>
                    )}
                    {selected.raw_gps_text && (
                      <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Raw GPS OCR</p>
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">{selected.raw_gps_text}</code></div>
                    )}
                  </div>

                  {/* Review info */}
                  {selected.reviewed_at && (
                    <div className="rounded-lg border p-4 space-y-1 text-sm">
                      <p className="font-medium">Review</p>
                      <p>By <span className="font-medium">{selected.reviewed_by}</span> · {format(new Date(selected.reviewed_at), "PPpp")}</p>
                      {selected.review_note && <p className="text-muted-foreground italic">"{selected.review_note}"</p>}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
