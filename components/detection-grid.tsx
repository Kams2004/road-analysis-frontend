"use client"

import { useState } from "react"
import Image from "next/image"
import {
  MapPin,
  Clock,
  Video,
  ChevronRight,
  Filter,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { Detection, DetectionType, DetectionSeverity, ValidationStatus } from "@/lib/types"
import { mockDetections } from "@/lib/mock-data"
import { format } from "date-fns"

const typeLabels: Record<DetectionType, string> = {
  pothole: "Pothole",
  traffic_sign: "Traffic Sign",
  speed_bump: "Speed Bump",
  speed_hump: "Speed Hump",
  crack: "Road Crack",
  debris: "Debris",
  road_damage: "Road Damage",
  missing_sign: "Missing Sign",
}

const severityColors: Record<DetectionSeverity, string> = {
  low: "bg-info/20 text-info border-info/30",
  medium: "bg-warning/20 text-warning border-warning/30",
  high: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  critical: "bg-destructive/20 text-destructive border-destructive/30",
}

const statusColors: Record<ValidationStatus, string> = {
  pending: "bg-warning/20 text-warning border-warning/30",
  validated: "bg-success/20 text-success border-success/30",
  rejected: "bg-destructive/20 text-destructive border-destructive/30",
}

interface DetectionGridProps {
  showValidationActions?: boolean
  filterStatus?: ValidationStatus
  onValidate?: (id: string, status: ValidationStatus) => void
}

export function DetectionGrid({
  showValidationActions = false,
  filterStatus,
  onValidate,
}: DetectionGridProps) {
  const [detections, setDetections] = useState<Detection[]>(mockDetections)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null)

  const filteredDetections = detections.filter((detection) => {
    if (filterStatus && detection.validationStatus !== filterStatus) return false
    if (typeFilter !== "all" && detection.type !== typeFilter) return false
    if (severityFilter !== "all" && detection.severity !== severityFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        detection.location.address?.toLowerCase().includes(query) ||
        detection.type.toLowerCase().includes(query) ||
        detection.videoSource.toLowerCase().includes(query)
      )
    }
    return true
  })

  const handleValidation = (id: string, status: ValidationStatus) => {
    setDetections((prev) =>
      prev.map((d) => (d.id === id ? { ...d, validationStatus: status } : d))
    )
    if (onValidate) onValidate(id, status)
    setSelectedDetection(null)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by location, type, or source..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(typeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-40">
              <AlertTriangle className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredDetections.length} of {detections.length} detections
        </p>
      </div>

      {/* Detection Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDetections.map((detection) => (
          <div
            key={detection.id}
            className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg"
          >
            {/* Image */}
            <div className="relative aspect-video bg-muted">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background/80">
                  <Video className="h-8 w-8 text-muted-foreground" />
                </div>
              </div>
              {detection.boundingBox && (
                <div
                  className="absolute border-2 border-destructive bg-destructive/20"
                  style={{
                    left: `${(detection.boundingBox.x / 640) * 100}%`,
                    top: `${(detection.boundingBox.y / 480) * 100}%`,
                    width: `${(detection.boundingBox.width / 640) * 100}%`,
                    height: `${(detection.boundingBox.height / 480) * 100}%`,
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <Badge variant="outline" className={severityColors[detection.severity]}>
                  {detection.severity}
                </Badge>
                <span className="text-xs font-medium text-foreground">
                  {Math.round(detection.confidence * 100)}% confidence
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {typeLabels[detection.type]}
                  </h3>
                  <Badge
                    variant="outline"
                    className={cn("mt-1", statusColors[detection.validationStatus])}
                  >
                    {detection.validationStatus}
                  </Badge>
                </div>
              </div>

              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{detection.location.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {format(new Date(detection.timestamp), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{detection.videoSource}</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelectedDetection(detection)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Button>
                {showValidationActions && detection.validationStatus === "pending" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-success hover:bg-success/10"
                      onClick={() => handleValidation(detection.id, "validated")}
                    >
                      <CheckCircle className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleValidation(detection.id, "rejected")}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredDetections.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            No detections found
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters or upload more videos for analysis
          </p>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedDetection} onOpenChange={() => setSelectedDetection(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selectedDetection && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {typeLabels[selectedDetection.type]}
                  <Badge
                    variant="outline"
                    className={severityColors[selectedDetection.severity]}
                  >
                    {selectedDetection.severity}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Detection ID: {selectedDetection.id}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Frame Preview */}
                <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Video className="h-16 w-16 text-muted-foreground" />
                  </div>
                  {selectedDetection.boundingBox && (
                    <div
                      className="absolute border-2 border-destructive bg-destructive/20"
                      style={{
                        left: `${(selectedDetection.boundingBox.x / 640) * 100}%`,
                        top: `${(selectedDetection.boundingBox.y / 480) * 100}%`,
                        width: `${(selectedDetection.boundingBox.width / 640) * 100}%`,
                        height: `${(selectedDetection.boundingBox.height / 480) * 100}%`,
                      }}
                    />
                  )}
                </div>

                {/* Details Grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Location</p>
                    <p className="text-sm text-foreground">
                      {selectedDetection.location.address}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedDetection.location.latitude.toFixed(6)},{" "}
                      {selectedDetection.location.longitude.toFixed(6)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Confidence</p>
                    <p className="text-sm text-foreground">
                      {Math.round(selectedDetection.confidence * 100)}%
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Timestamp</p>
                    <p className="text-sm text-foreground">
                      {format(new Date(selectedDetection.timestamp), "PPpp")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Source</p>
                    <p className="text-sm text-foreground">
                      {selectedDetection.videoSource}
                    </p>
                  </div>
                </div>

                {/* Validation Actions */}
                {showValidationActions && selectedDetection.validationStatus === "pending" && (
                  <div className="flex gap-3 pt-4 border-t border-border">
                    <Button
                      className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                      onClick={() => handleValidation(selectedDetection.id, "validated")}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Validate as Risk Zone
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-destructive hover:bg-destructive/10"
                      onClick={() => handleValidation(selectedDetection.id, "rejected")}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject Detection
                    </Button>
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
