"use client"

import { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { Sidebar } from "@/components/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin, RefreshCw, X, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchDetections, resolveMinioUrl, type ApiDetection } from "@/lib/api"
import Image from "next/image"

// Load map only on client side
const DetectionMap = dynamic(() => import("@/components/detection-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/30 rounded-xl">
      <div className="text-center space-y-2">
        <MapPin className="mx-auto h-10 w-10 text-muted-foreground animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading map…</p>
      </div>
    </div>
  ),
})

const TYPE_COLORS: Record<string, string> = {
  pothole:      "bg-red-500",
  traffic_sign: "bg-blue-500",
  speed_bump:   "bg-yellow-500",
  speed_hump:   "bg-orange-400",
  default:      "bg-purple-500",
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-warning/20 text-warning border-warning/30",
  validated: "bg-success/20 text-success border-success/30",
  rejected:  "bg-destructive/20 text-destructive border-destructive/30",
}

export default function MapPage() {
  const [detections, setDetections]   = useState<ApiDetection[]>([])
  const [filtered, setFiltered]       = useState<ApiDetection[]>([])
  const [loading, setLoading]         = useState(true)
  const [typeFilter, setTypeFilter]   = useState("all")
  const [statusFilter, setStatusFilter] = useState("validated")
  const [selected, setSelected]       = useState<ApiDetection | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchDetections({ skip: 0, limit: 500 })
      const withCoords = res.items.filter((d) => d.latitude != null && d.longitude != null)
      setDetections(withCoords)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let result = detections
    if (typeFilter !== "all")   result = result.filter((d) => d.type === typeFilter)
    if (statusFilter !== "all") result = result.filter((d) => d.review_status === statusFilter)
    setFiltered(result)
  }, [detections, typeFilter, statusFilter])

  const types = [...new Set(detections.map((d) => d.type))]

  const counts = {
    total:     filtered.length,
    pending:   filtered.filter((d) => d.review_status === "pending").length,
    validated: filtered.filter((d) => d.review_status === "validated").length,
    rejected:  filtered.filter((d) => d.review_status === "rejected").length,
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64 h-screen flex flex-col">
        <div className="px-4 pt-8 pb-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Detection Map</h1>
              <p className="mt-1 text-muted-foreground">Geographic view of all detected road hazards</p>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {/* Filters + stats */}
          <div className="relative z-[2000] flex flex-wrap items-center gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="all">All Types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="validated">Validated only</SelectItem>
                <SelectItem value="rejected">Rejected only</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{counts.total}</span> points
              {counts.pending > 0 && <Badge variant="outline" className="h-5 text-xs bg-warning/10 text-warning border-warning/30">{counts.pending} pending</Badge>}
              {counts.validated > 0 && <Badge variant="outline" className="h-5 text-xs bg-success/10 text-success border-success/30">{counts.validated} validated</Badge>}
              {counts.rejected > 0 && <Badge variant="outline" className="h-5 text-xs bg-destructive/10 text-destructive border-destructive/30">{counts.rejected} rejected</Badge>}
            </div>
          </div>
        </div>

        {/* Map + side panel */}
        <div className="flex-1 px-4 pb-4 sm:px-6 lg:px-8 flex gap-4 min-h-0">

          {/* Map */}
          <div className="flex-1 relative rounded-xl overflow-hidden border border-border min-h-0">
            {filtered.length === 0 && !loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/70 pointer-events-none">
                <MapPin className="h-12 w-12 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No detections with GPS coordinates</p>
              </div>
            )}
            <DetectionMap key={filtered.length > 0 ? "loaded" : "empty"} detections={filtered} onMarkerClick={setSelected} />

            {/* Legend */}
            <div className="absolute bottom-4 left-4 z-[1000] rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 text-xs space-y-1.5">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Types</p>
              {types.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <div className={cn("h-3 w-3 rounded-full", TYPE_COLORS[t] ?? "bg-purple-500")} />
                  <span className="capitalize">{t.replace("_", " ")}</span>
                </div>
              ))}
              <div className="border-t border-border mt-1 pt-1 space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Status opacity</p>
                <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-foreground" /><span>Pending</span></div>
                <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-foreground opacity-85" /><span>Validated</span></div>
                <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-foreground opacity-40" /><span>Rejected</span></div>
              </div>
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
              <Card className="flex-1">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold capitalize">{selected.type.replace("_", " ")}{selected.subtype ? ` / ${selected.subtype}` : ""}</p>
                      <p className="text-xs text-muted-foreground">Frame #{selected.frame_number}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={cn("text-xs capitalize", STATUS_COLORS[selected.review_status])}>
                        {selected.review_status}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelected(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Frame image */}
                  {resolveMinioUrl(selected.image_url) ? (
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                      <Image src={resolveMinioUrl(selected.image_url)!} alt="frame" fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Crop */}
                  {resolveMinioUrl(selected.crop_url) && (
                    <div className="flex items-center gap-3">
                      <div className="relative h-16 w-20 rounded overflow-hidden bg-muted shrink-0">
                        <Image src={resolveMinioUrl(selected.crop_url)!} alt="crop" fill className="object-cover" unoptimized />
                      </div>
                      <div className="text-xs space-y-1">
                        <p><span className="text-muted-foreground">Confidence:</span> <b>{Math.round(selected.confidence * 100)}%</b></p>
                        {selected.speed_kmh != null && <p><span className="text-muted-foreground">Speed:</span> <b>{selected.speed_kmh} km/h</b></p>}
                      </div>
                    </div>
                  )}

                  {/* Location */}
                  <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="font-medium">Location</span>
                    </div>
                    {selected.location_name && <p className="font-medium">{selected.location_name}</p>}
                    <p className="text-muted-foreground font-mono">
                      {selected.latitude!.toFixed(6)}, {selected.longitude!.toFixed(6)}
                    </p>
                  </div>

                  {selected.review_note && (
                    <div className="text-xs">
                      <p className="text-muted-foreground">Rejection note</p>
                      <p className="font-medium">{selected.review_note}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
