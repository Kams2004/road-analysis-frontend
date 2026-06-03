"use client"

import { useState, useCallback } from "react"
import {
  Upload,
  FileVideo,
  Loader2,
  ImageIcon,
  MapPin,
  CheckCircle2,
  XCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/components/sidebar"
import { ModelSelector, ModelBadges, AVAILABLE_MODELS } from "@/components/model-selector"
import type { Detection, DetectionType, DetectionSeverity, ValidationStatus } from "@/lib/types"

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
  low: "bg-info/10 text-info border-info/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  high: "bg-chart-3/10 text-chart-3 border-chart-3/30",
  critical: "bg-destructive/10 text-destructive border-destructive/30",
}

const statusColors: Record<ValidationStatus, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  validated: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
}

interface UploadFile {
  id: string
  file: File
  status: "uploading" | "processing" | "completed" | "failed"
  progress: number
  error?: string
  detections: Detection[]
  selectedModels: string[]
}

// Generate mock detections based on selected models
function generateMockDetections(filename: string, selectedModels: string[]): Detection[] {
  const modelToTypes: Record<string, DetectionType[]> = {
    potholes: ["pothole", "crack", "road_damage"],
    traffic_lights: ["traffic_sign", "missing_sign"],
    speed_hump: ["speed_bump", "speed_hump"],
  }
  
  const availableTypes = selectedModels.flatMap((m) => modelToTypes[m] || [])
  if (availableTypes.length === 0) return []
  
  const severities: DetectionSeverity[] = ["low", "medium", "high", "critical"]
  const count = Math.floor(Math.random() * 8) + 3

  return Array.from({ length: count }, (_, i) => ({
    id: `det-${Date.now()}-${i}`,
    type: availableTypes[Math.floor(Math.random() * availableTypes.length)],
    severity: severities[Math.floor(Math.random() * severities.length)],
    confidence: 0.75 + Math.random() * 0.24,
    location: {
      latitude: 48.8566 + (Math.random() - 0.5) * 0.1,
      longitude: 2.3522 + (Math.random() - 0.5) * 0.1,
      address: `${Math.floor(Math.random() * 200) + 1} ${["Main St", "Oak Ave", "Elm Rd", "Park Blvd", "River Dr"][Math.floor(Math.random() * 5)]}, Paris`,
    },
    timestamp: new Date().toISOString(),
    frameUrl: "/api/placeholder/640/480",
    videoSource: filename,
    validationStatus: "pending" as ValidationStatus,
    boundingBox: {
      x: Math.floor(Math.random() * 400) + 50,
      y: Math.floor(Math.random() * 300) + 50,
      width: Math.floor(Math.random() * 100) + 50,
      height: Math.floor(Math.random() * 80) + 40,
    },
  }))
}

export default function UploadPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedModels, setSelectedModels] = useState<string[]>(
    AVAILABLE_MODELS.map((m) => m.id)
  )
  const pageSize = 10

  // All detections from completed uploads
  const allDetections = uploadedFiles
    .filter((f) => f.status === "completed")
    .flatMap((f) => f.detections)

  const totalPages = Math.ceil(allDetections.length / pageSize)
  const paginatedDetections = allDetections.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const simulateProcessing = (uploadFile: UploadFile) => {
    // Simulate upload progress
    let progress = 0
    const uploadInterval = setInterval(() => {
      progress += Math.random() * 15 + 5
      if (progress >= 100) {
        progress = 100
        clearInterval(uploadInterval)
        
        // Move to processing
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, status: "processing", progress: 0 } : f
          )
        )

        // Simulate processing
        let procProgress = 0
        const procInterval = setInterval(() => {
          procProgress += Math.random() * 10 + 2
          if (procProgress >= 100) {
            procProgress = 100
            clearInterval(procInterval)
            
            // Complete with detections
            const detections = generateMockDetections(uploadFile.file.name, uploadFile.selectedModels)
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === uploadFile.id
                  ? { ...f, status: "completed", progress: 100, detections }
                  : f
              )
            )
          } else {
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === uploadFile.id ? { ...f, progress: procProgress } : f
              )
            )
          }
        }, 200)
      } else {
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, progress } : f
          )
        )
      }
    }, 150)
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || selectedModels.length === 0) return

    const videoFiles = Array.from(files).filter((file) =>
      file.type.startsWith("video/")
    )

    videoFiles.forEach((file) => {
      const uploadFile: UploadFile = {
        id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: "uploading",
        progress: 0,
        detections: [],
        selectedModels: [...selectedModels],
      }

      setUploadedFiles((prev) => [uploadFile, ...prev])
      simulateProcessing(uploadFile)
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [selectedModels])

  const handleValidation = (id: string, status: ValidationStatus) => {
    setUploadedFiles((prev) =>
      prev.map((f) => ({
        ...f,
        detections: f.detections.map((d) =>
          d.id === id ? { ...d, validationStatus: status } : d
        ),
      }))
    )
    setSelectedDetection(null)
  }

  const activeUploads = uploadedFiles.filter(
    (f) => f.status === "uploading" || f.status === "processing"
  )

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Upload Videos</h1>
            <p className="mt-1 text-muted-foreground">
              Upload video files for AI-powered road hazard analysis
            </p>
          </div>

          <div className="space-y-6">
            {/* Upload Area */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Upload Video Files</CardTitle>
                <CardDescription>
                  Select detection models and upload video files for analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Model Selection */}
                <ModelSelector
                  selectedModels={selectedModels}
                  onSelectionChange={setSelectedModels}
                />

                {/* Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50",
                    selectedModels.length === 0 && "opacity-50 pointer-events-none"
                  )}
                >
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={(e) => handleFiles(e.target.files)}
                    disabled={selectedModels.length === 0}
                    className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  />
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <p className="mt-4 text-lg font-medium text-foreground">
                    Drop video files here or click to upload
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Supports MP4, AVI, MOV, MKV up to 2GB
                  </p>
                  {selectedModels.length > 0 && (
                    <div className="mt-4">
                      <ModelBadges modelIds={selectedModels} />
                    </div>
                  )}
                </div>

                {/* Active Uploads */}
                {activeUploads.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground">Active Uploads</h3>
                    {activeUploads.map((upload) => (
                      <div
                        key={upload.id}
                        className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <FileVideo className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground truncate">
                              {upload.file.name}
                            </p>
                            <ModelBadges modelIds={upload.selectedModels} />
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <Progress value={upload.progress} className="flex-1 h-2" />
                            <span className="text-sm text-muted-foreground w-16">
                              {Math.round(upload.progress)}%
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {upload.status === "uploading" ? "Uploading..." : "Processing with AI models..."}
                          </p>
                        </div>
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How It Works */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">How It Works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Select Models</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose which detections to run
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Upload Video</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Dashcam, drone, or surveillance
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-foreground">AI Analysis</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Models detect hazards in frames
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                      4
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Validate</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Confirm risk zones below
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results Table */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Processed Results</CardTitle>
                    <CardDescription>
                      Detection results from uploaded videos. Validate or reject each detection.
                    </CardDescription>
                  </div>
                  {allDetections.length > 0 && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      {allDetections.length} detections
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {allDetections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">No results yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Upload a video to see detection results here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="w-20">Frame</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Severity</TableHead>
                            <TableHead>Confidence</TableHead>
                            <TableHead className="hidden md:table-cell">Location</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedDetections.map((detection) => (
                            <TableRow key={detection.id}>
                              <TableCell>
                                <div className="relative h-12 w-16 rounded overflow-hidden bg-muted flex items-center justify-center">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-foreground">
                                  {typeLabels[detection.type]}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("capitalize", severityColors[detection.severity])}>
                                  {detection.severity}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={detection.confidence * 100} className="w-16 h-1.5" />
                                  <span className="text-sm">{Math.round(detection.confidence * 100)}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <div className="flex items-center gap-1.5 text-sm">
                                  <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <span className="truncate max-w-[150px]">{detection.location.address}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("capitalize", statusColors[detection.validationStatus])}>
                                  {detection.validationStatus}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setSelectedDetection(detection)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {detection.validationStatus === "pending" && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-success hover:text-success hover:bg-success/10"
                                        onClick={() => handleValidation(detection.id, "validated")}
                                      >
                                        <CheckCircle2 className="h-4 w-4" />
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
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Page {currentPage} of {totalPages}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Detection Detail Dialog */}
      <Dialog open={!!selectedDetection} onOpenChange={() => setSelectedDetection(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detection Details</DialogTitle>
            <DialogDescription>
              Review the detection and validate or reject it
            </DialogDescription>
          </DialogHeader>
          {selectedDetection && (
            <div className="space-y-4">
              <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                <ImageIcon className="h-12 w-12 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{typeLabels[selectedDetection.type]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Severity</p>
                  <Badge variant="outline" className={cn("capitalize", severityColors[selectedDetection.severity])}>
                    {selectedDetection.severity}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Confidence</p>
                  <p className="font-medium">{Math.round(selectedDetection.confidence * 100)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={cn("capitalize", statusColors[selectedDetection.validationStatus])}>
                    {selectedDetection.validationStatus}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Location</p>
                  <p className="font-medium">{selectedDetection.location.address}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedDetection.location.latitude.toFixed(6)}, {selectedDetection.location.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
              {selectedDetection.validationStatus === "pending" && (
                <div className="flex gap-2 pt-4">
                  <Button
                    className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => handleValidation(selectedDetection.id, "validated")}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Validate as Risk Zone
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleValidation(selectedDetection.id, "rejected")}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
