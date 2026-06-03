"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import {
  MapPin,
  Clock,
  Video,
  Filter,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ImageIcon,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

interface DetectionTableProps {
  showValidationActions?: boolean
  filterStatus?: ValidationStatus
  onValidate?: (id: string, status: ValidationStatus) => void
  initialData?: Detection[]
  pageSize?: number
}

export function DetectionTable({
  showValidationActions = false,
  filterStatus,
  onValidate,
  initialData,
  pageSize = 10,
}: DetectionTableProps) {
  const [detections, setDetections] = useState<Detection[]>(initialData || mockDetections)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const filteredDetections = useMemo(() => {
    return detections.filter((detection) => {
      if (filterStatus && detection.validationStatus !== filterStatus) return false
      if (typeFilter !== "all" && detection.type !== typeFilter) return false
      if (severityFilter !== "all" && detection.severity !== severityFilter) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          detection.location.address?.toLowerCase().includes(query) ||
          detection.type.toLowerCase().includes(query) ||
          detection.videoSource.toLowerCase().includes(query) ||
          detection.id.toLowerCase().includes(query)
        )
      }
      return true
    })
  }, [detections, filterStatus, typeFilter, severityFilter, searchQuery])

  const totalPages = Math.ceil(filteredDetections.length / pageSize)
  const paginatedDetections = filteredDetections.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const handleValidation = (id: string, status: ValidationStatus) => {
    setDetections((prev) =>
      prev.map((d) => (d.id === id ? { ...d, validationStatus: status } : d))
    )
    if (onValidate) onValidate(id, status)
    setSelectedDetection(null)
  }

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by ID, location, type, or source..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1) }}>
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
          <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setCurrentPage(1) }}>
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
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Showing {paginatedDetections.length} of {filteredDetections.length} detections
        </p>
        <p>
          Page {currentPage} of {totalPages || 1}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-20">Frame</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden lg:table-cell">Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedDetections.map((detection) => (
              <TableRow key={detection.id} className="group">
                <TableCell>
                  <div className="relative h-12 w-16 rounded overflow-hidden bg-muted flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">
                    {typeLabels[detection.type]}
                  </div>
                  <div className="text-xs text-muted-foreground">{detection.id}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("capitalize", severityColors[detection.severity])}>
                    {detection.severity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${detection.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-sm">{Math.round(detection.confidence * 100)}%</span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-1.5 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate max-w-[180px]">{detection.location.address}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {detection.location.latitude.toFixed(4)}, {detection.location.longitude.toFixed(4)}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Video className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate max-w-[150px]">{detection.videoSource}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(detection.timestamp), "MMM d, HH:mm")}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("capitalize", statusColors[detection.validationStatus])}>
                    {detection.validationStatus}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedDetection(detection)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {showValidationActions && detection.validationStatus === "pending" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-success hover:text-success hover:bg-success/10"
                          onClick={() => handleValidation(detection.id, "validated")}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleValidation(detection.id, "rejected")}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {paginatedDetections.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">No detections found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredDetections.length)} of {filteredDetections.length} items
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number
                if (totalPages <= 5) {
                  page = i + 1
                } else if (currentPage <= 3) {
                  page = i + 1
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i
                } else {
                  page = currentPage - 2 + i
                }
                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => goToPage(page)}
                  >
                    {page}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
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
                    <ImageIcon className="h-16 w-16 text-muted-foreground" />
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
