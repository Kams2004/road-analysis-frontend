"use client"

import { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { Sidebar } from "@/components/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin, RefreshCw, X, ImageIcon, ChevronLeft, Circle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  fetchDetections, fetchClusters, resolveCluster, resolveMinioUrl,
  type ApiDetection, type ClusterOut, type ClusteredDetectionsOut,
} from "@/lib/api"
import Image from "next/image"

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

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-warning/20 text-warning border-warning/30",
  validated: "bg-success/20 text-success border-success/30",
  rejected:  "bg-destructive/20 text-destructive border-destructive/30",
  resolved:  "bg-blue-500/20 text-blue-500 border-blue-500/30",
}

const TYPE_COLORS: Record<string, string> = {
  pothole:      "bg-red-500",
  traffic_sign: "bg-blue-500",
  speed_bump:   "bg-yellow-500",
  speed_hump:   "bg-orange-400",
  default:      "bg-purple-500",
}

export default function MapPage() {
  const [detections, setDetections]           = useState<ApiDetection[]>([])
  const [clusterData, setClusterData]         = useState<ClusteredDetectionsOut | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [typeFilter, setTypeFilter]           = useState("all")

  const [selectedCluster, setSelectedCluster]     = useState<ClusterOut | null>(null)
  const [clusterDetections, setClusterDetections] = useState<ApiDetection[]>([])
  const [selectedDetection, setSelectedDetection] = useState<ApiDetection | null>(null)

  // resolve dialog state
  const [resolving, setResolving]           = useState(false)
  const [newDetectionCount, setNewDetectionCount] = useState("0")
  const [resolveError, setResolveError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [detRes, clusterRes] = await Promise.all([
        fetchDetections({ skip: 0, limit: 1000 }),
        fetchClusters({ type: typeFilter !== "all" ? typeFilter : undefined }),
      ])
      setDetections(detRes.items.filter((d) => d.latitude != null && d.longitude != null))
      setClusterData(clusterRes)
      // refresh selected cluster from new data
      setSelectedCluster((prev) => {
        if (!prev) return null
        return clusterRes.clusters.find((c) => c.cluster_id === prev.cluster_id) ?? null
      })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [typeFilter])

  useEffect(() => { load() }, [load])

  // when selected cluster changes, resolve its detections
  useEffect(() => {
    if (!selectedCluster) { setClusterDetections([]); return }
    const ids = new Set(selectedCluster.detection_ids)
    setClusterDetections(detections.filter((d) => ids.has(d.id)))
  }, [selectedCluster, detections])

  const handleClusterClick = useCallback((c: ClusterOut) => {
    setSelectedCluster(c)
    setSelectedDetection(null)
    setResolveError(null)
    setNewDetectionCount("0")
  }, [])

  const handleResolve = async () => {
    if (!selectedCluster) return
    setResolving(true)
    setResolveError(null)
    try {
      const count = parseInt(newDetectionCount, 10) || 0
      await resolveCluster(selectedCluster.detection_ids, count, "operator")
      await load()
      setSelectedDetection(null)
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "Failed to resolve")
    } finally {
      setResolving(false)
    }
  }

  const types = [...new Set(detections.map((d) => d.type))]

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64 h-screen flex flex-col">

        {/* Header */}
        <div className="px-4 pt-8 pb-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Detection Map</h1>
              <p className="mt-1 text-muted-foreground">Spatial clusters of validated road hazards</p>
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

            {clusterData && (
              <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{clusterData.total_clusters}</span> clusters
                <span className="text-muted-foreground/40">·</span>
                <Badge variant="outline" className="h-5 text-xs bg-orange-500/10 text-orange-500 border-orange-500/30">
                  {clusterData.active_clusters} active
                </Badge>
                <Badge variant="outline" className="h-5 text-xs bg-green-500/10 text-green-600 border-green-500/30">
                  {clusterData.resolved_clusters} resolved
                </Badge>
                <span className="text-muted-foreground/40">·</span>
                <span>{clusterData.total_detections} detections</span>
                <Badge variant="outline" className="h-5 text-xs">{clusterData.radius_m} m radius</Badge>
              </div>
            )}
          </div>
        </div>

        {/* Map + panel */}
        <div className="flex-1 px-4 pb-4 sm:px-6 lg:px-8 flex gap-4 min-h-0">

          {/* Map */}
          <div className="flex-1 relative rounded-xl overflow-hidden border border-border min-h-0">
            {!loading && clusterData?.total_clusters === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/70 pointer-events-none">
                <MapPin className="h-12 w-12 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No validated detections with GPS coordinates</p>
              </div>
            )}

            <DetectionMap
              clusters={clusterData?.clusters ?? []}
              radiusM={clusterData?.radius_m}
              onClusterClick={handleClusterClick}
              selectedCluster={selectedCluster}
              expandedDetections={clusterDetections}
              onDetectionClick={setSelectedDetection}
            />

            {/* Legend */}
            <div className="absolute bottom-4 left-4 z-[1000] rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 text-xs space-y-1.5">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Clusters</p>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-orange-500" /><span>Active</span></div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-indigo-500" /><span>Selected</span></div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-green-500" /><span>Resolved</span></div>
              <div className="border-t border-border mt-1 pt-1 space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Detections</p>
                {types.map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <div className={cn("h-2.5 w-2.5 rounded-full", TYPE_COLORS[t] ?? "bg-purple-500")} />
                    <span className="capitalize">{t.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Side panel */}
          {selectedDetection ? (
            <DetectionDetailPanel
              detection={selectedDetection}
              onClose={() => setSelectedDetection(null)}
            />
          ) : selectedCluster ? (
            <ClusterDetailPanel
              cluster={selectedCluster}
              detections={clusterDetections}
              newDetectionCount={newDetectionCount}
              onNewDetectionCountChange={setNewDetectionCount}
              resolving={resolving}
              resolveError={resolveError}
              onResolve={handleResolve}
              onDetectionClick={setSelectedDetection}
              onBack={() => { setSelectedCluster(null); setClusterDetections([]) }}
            />
          ) : (
            <ClusterListPanel
              clusterData={clusterData}
              onClusterClick={handleClusterClick}
            />
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Cluster list panel ───────────────────────────────────────────────────────

function ClusterListPanel({
  clusterData,
  onClusterClick,
}: {
  clusterData: ClusteredDetectionsOut | null
  onClusterClick: (c: ClusterOut) => void
}) {
  return (
    <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto">
      {clusterData && (
        <Card className="shrink-0">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>Total clusters</span><span className="font-medium text-foreground">{clusterData.total_clusters}</span></div>
            <div className="flex justify-between"><span>Active</span><span className="font-medium text-orange-500">{clusterData.active_clusters}</span></div>
            <div className="flex justify-between"><span>Resolved</span><span className="font-medium text-green-600">{clusterData.resolved_clusters}</span></div>
            <div className="flex justify-between"><span>Detections</span><span className="font-medium text-foreground">{clusterData.total_detections}</span></div>
            <div className="flex justify-between"><span>Cluster radius</span><span className="font-medium text-foreground">{clusterData.radius_m} m</span></div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground px-1">Click a cluster on the map or in the list below</p>

      <div className="space-y-2 overflow-y-auto">
        {clusterData?.clusters.map((c) => (
          <button
            key={c.cluster_id}
            onClick={() => onClusterClick(c)}
            className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors px-3 py-2.5"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Circle className={cn("h-3.5 w-3.5 fill-current", c.is_resolved ? "text-green-500" : "text-orange-500")} />
                <span className="text-sm font-medium">Cluster #{c.cluster_id}</span>
              </div>
              <div className="flex items-center gap-1">
                {c.is_resolved && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                <Badge variant="secondary" className="text-xs">{c.count}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {c.centroid_lat.toFixed(5)}, {c.centroid_lon.toFixed(5)}
            </p>
            {c.resolved_count > 0 && !c.is_resolved && (
              <p className="text-xs text-green-600 mt-0.5">{c.resolved_count}/{c.count} resolved</p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Cluster detail panel ─────────────────────────────────────────────────────

function ClusterDetailPanel({
  cluster,
  detections,
  newDetectionCount,
  onNewDetectionCountChange,
  resolving,
  resolveError,
  onResolve,
  onDetectionClick,
  onBack,
}: {
  cluster:                   ClusterOut
  detections:                ApiDetection[]
  newDetectionCount:         string
  onNewDetectionCountChange: (v: string) => void
  resolving:                 boolean
  resolveError:              string | null
  onResolve:                 () => void
  onDetectionClick:          (d: ApiDetection) => void
  onBack:                    () => void
}) {
  const count = parseInt(newDetectionCount, 10) || 0
  const willResolve = count < cluster.count

  return (
    <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
      {/* Back */}
      <Button variant="ghost" size="sm" className="gap-1 self-start -mb-1" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" /> All clusters
      </Button>

      {/* Cluster header */}
      <Card className="shrink-0">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Circle className={cn("h-4 w-4 fill-current", cluster.is_resolved ? "text-green-500" : "text-orange-500")} />
              <span className="font-semibold text-sm">Cluster #{cluster.cluster_id}</span>
            </div>
            <Badge variant="outline" className={cn("text-xs", cluster.is_resolved
              ? "bg-green-500/10 text-green-600 border-green-500/30"
              : "bg-orange-500/10 text-orange-500 border-orange-500/30"
            )}>
              {cluster.is_resolved ? "Resolved" : "Active"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {cluster.centroid_lat.toFixed(6)}, {cluster.centroid_lon.toFixed(6)}
          </p>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span><b className="text-foreground">{cluster.count}</b> detections</span>
            {cluster.resolved_count > 0 && (
              <span><b className="text-green-600">{cluster.resolved_count}</b> resolved</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resolve action — only for active clusters */}
      {!cluster.is_resolved && (
        <Card className="shrink-0">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-medium text-foreground">Mark as Resolved</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A vehicle passed through this zone. Enter how many detections the new pass found.
              If fewer than the original <b>{cluster.count}</b>, the cluster is resolved.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">New detection count</Label>
              <Input
                type="number"
                min={0}
                value={newDetectionCount}
                onChange={(e) => onNewDetectionCountChange(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            {willResolve ? (
              <p className="text-xs text-green-600">
                ✓ {count === 0 ? "No detections — hazard cleared." : `${count} < ${cluster.count} — improvement confirmed.`} Will resolve all {cluster.count} detections.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {count} ≥ {cluster.count} — hazard persists, nothing will change.
              </p>
            )}
            {resolveError && <p className="text-xs text-destructive">{resolveError}</p>}
            <Button
              size="sm"
              className="w-full"
              disabled={resolving || !willResolve}
              onClick={onResolve}
            >
              {resolving ? "Resolving…" : "Confirm Resolution"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Detection list */}
      <p className="text-xs font-medium text-muted-foreground px-1">
        Detections in this cluster
      </p>
      <div className="space-y-2 overflow-y-auto">
        {detections.map((det) => (
          <button
            key={det.id}
            onClick={() => onDetectionClick(det)}
            className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors px-3 py-2.5 space-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium capitalize">{det.type.replace("_", " ")}</span>
              <Badge variant="outline" className={cn("text-xs capitalize", STATUS_COLORS[det.review_status])}>
                {det.review_status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {det.location_name ?? `${det.latitude?.toFixed(5)}, ${det.longitude?.toFixed(5)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              Confidence: <b>{Math.round(det.confidence * 100)}%</b>
              {det.subtype && <span className="ml-2 capitalize">{det.subtype}</span>}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Detection detail panel ───────────────────────────────────────────────────

function DetectionDetailPanel({ detection: d, onClose }: { detection: ApiDetection; onClose: () => void }) {
  return (
    <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
      <Button variant="ghost" size="sm" className="gap-1 self-start -mb-1" onClick={onClose}>
        <ChevronLeft className="h-4 w-4" /> Back to cluster
      </Button>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold capitalize">{d.type.replace("_", " ")}{d.subtype ? ` / ${d.subtype}` : ""}</p>
              <p className="text-xs text-muted-foreground">Frame #{d.frame_number}</p>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={cn("text-xs capitalize", STATUS_COLORS[d.review_status])}>
                {d.review_status}
              </Badge>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {resolveMinioUrl(d.image_url) ? (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
              <Image src={resolveMinioUrl(d.image_url)!} alt="frame" fill className="object-cover" unoptimized />
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}

          {resolveMinioUrl(d.crop_url) && (
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-20 rounded overflow-hidden bg-muted shrink-0">
                <Image src={resolveMinioUrl(d.crop_url)!} alt="crop" fill className="object-cover" unoptimized />
              </div>
              <div className="text-xs space-y-1">
                <p><span className="text-muted-foreground">Confidence:</span> <b>{Math.round(d.confidence * 100)}%</b></p>
                {d.speed_kmh != null && <p><span className="text-muted-foreground">Speed:</span> <b>{d.speed_kmh} km/h</b></p>}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /><span className="font-medium">Location</span>
            </div>
            {d.location_name && <p className="font-medium">{d.location_name}</p>}
            <p className="text-muted-foreground font-mono">{d.latitude!.toFixed(6)}, {d.longitude!.toFixed(6)}</p>
          </div>

          {d.resolved_at && (
            <div className="text-xs">
              <p className="text-muted-foreground">Resolved at</p>
              <p className="font-medium">{new Date(d.resolved_at).toLocaleString()}</p>
            </div>
          )}

          {d.review_note && (
            <div className="text-xs">
              <p className="text-muted-foreground">Note</p>
              <p className="font-medium">{d.review_note}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
