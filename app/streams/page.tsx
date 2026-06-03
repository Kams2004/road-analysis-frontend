"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  Radio,
  Trash2,
  Play,
  Pause,
  Download,
  Loader2,
  Clock,
  ImageIcon,
  MapPin,
  Eye,
  ChevronLeft,
  ChevronRight,
  Wifi,
  Server,
  Code,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { Sidebar } from "@/components/sidebar"
import { ModelSelector, ModelBadges, AVAILABLE_MODELS } from "@/components/model-selector"
import type { StreamSource, StreamJob, Detection, DetectionType, DetectionSeverity, ValidationStatus } from "@/lib/types"
import { mockStreamSources } from "@/lib/mock-data"
import { formatDistanceToNow } from "date-fns"

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

interface ExtendedStreamJob extends StreamJob {
  selectedModels: string[]
}

function generateMockDetections(sourceName: string, selectedModels: string[]): Detection[] {
  const modelToTypes: Record<string, DetectionType[]> = {
    potholes: ["pothole", "crack", "road_damage"],
    traffic_lights: ["traffic_sign", "missing_sign"],
    speed_hump: ["speed_bump", "speed_hump"],
  }
  
  const availableTypes = selectedModels.flatMap((m) => modelToTypes[m] || [])
  if (availableTypes.length === 0) return []
  
  const severities: DetectionSeverity[] = ["low", "medium", "high", "critical"]
  const count = Math.floor(Math.random() * 6) + 2

  return Array.from({ length: count }, (_, i) => ({
    id: `det-stream-${Date.now()}-${i}`,
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
    videoSource: sourceName,
    validationStatus: "pending" as ValidationStatus,
  }))
}

export default function StreamsPage() {
  const [sources, setSources] = useState<StreamSource[]>(mockStreamSources)
  const [jobs, setJobs] = useState<ExtendedStreamJob[]>([])
  const [detections, setDetections] = useState<Detection[]>([])
  const [isAddingSource, setIsAddingSource] = useState(false)
  const [isPullDialogOpen, setIsPullDialogOpen] = useState(false)
  const [selectedSourceForPull, setSelectedSourceForPull] = useState<StreamSource | null>(null)
  const [pullModels, setPullModels] = useState<string[]>(AVAILABLE_MODELS.map((m) => m.id))
  const [newSource, setNewSource] = useState({
    name: "",
    url: "",
    type: "rtsp" as StreamSource["type"],
  })
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const totalPages = Math.ceil(detections.length / pageSize)
  const paginatedDetections = detections.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // Simulate job progress
  useEffect(() => {
    const interval = setInterval(() => {
      setJobs((prev) =>
        prev.map((job) => {
          if (job.status === "pulling") {
            const newProgress = Math.min(job.progress + Math.random() * 5 + 2, 100)
            if (newProgress >= 100) {
              return {
                ...job,
                status: "processing",
                progress: 0,
                totalFrames: 1500,
              }
            }
            return { ...job, progress: newProgress }
          }
          if (job.status === "processing") {
            const newProgress = Math.min(job.progress + Math.random() * 3 + 1, 100)
            const framesProcessed = Math.floor((newProgress / 100) * job.totalFrames)
            const newDetections = Math.floor(framesProcessed / 100)
            
            if (newProgress >= 100) {
              // Add detections when job completes
              const jobDetections = generateMockDetections(job.sourceName, job.selectedModels)
              setDetections((d) => [...jobDetections, ...d])
              
              return {
                ...job,
                status: "completed",
                progress: 100,
                framesProcessed: job.totalFrames,
                detectionCount: jobDetections.length,
                completedAt: new Date().toISOString(),
              }
            }
            return {
              ...job,
              progress: newProgress,
              framesProcessed,
              detectionCount: newDetections,
            }
          }
          return job
        })
      )
    }, 500)

    return () => clearInterval(interval)
  }, [])

  const handleAddSource = () => {
    const source: StreamSource = {
      id: `stream-${Date.now()}`,
      name: newSource.name,
      url: newSource.url,
      type: newSource.type,
      status: "inactive",
    }
    setSources((prev) => [source, ...prev])
    setNewSource({ name: "", url: "", type: "rtsp" })
    setIsAddingSource(false)
  }

  const handleRemoveSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id))
  }

  const handleToggleSource = (id: string) => {
    setSources((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: s.status === "active" ? "inactive" : "active",
              lastSync: s.status === "inactive" ? new Date().toISOString() : s.lastSync,
            }
          : s
      )
    )
  }

  const openPullDialog = (source: StreamSource) => {
    setSelectedSourceForPull(source)
    setPullModels(AVAILABLE_MODELS.map((m) => m.id))
    setIsPullDialogOpen(true)
  }

  const handlePullVideos = () => {
    if (!selectedSourceForPull || pullModels.length === 0) return

    const newJob: ExtendedStreamJob = {
      id: `job-${Date.now()}`,
      sourceId: selectedSourceForPull.id,
      sourceName: selectedSourceForPull.name,
      status: "queued",
      progress: 0,
      framesProcessed: 0,
      totalFrames: 0,
      detectionCount: 0,
      startedAt: new Date().toISOString(),
      selectedModels: [...pullModels],
    }
    
    setJobs((prev) => [newJob, ...prev])
    setIsPullDialogOpen(false)
    setSelectedSourceForPull(null)
    
    // Start pulling after a brief delay
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === newJob.id ? { ...j, status: "pulling" } : j
        )
      )
    }, 500)
  }

  const handleValidation = (id: string, status: ValidationStatus) => {
    setDetections((prev) =>
      prev.map((d) => (d.id === id ? { ...d, validationStatus: status } : d))
    )
    setSelectedDetection(null)
  }

  const getStatusBadge = (status: StreamSource["status"]) => {
    const variants: Record<StreamSource["status"], string> = {
      active: "bg-success/10 text-success border-success/30",
      inactive: "bg-muted text-muted-foreground border-border",
      error: "bg-destructive/10 text-destructive border-destructive/30",
    }
    return (
      <Badge variant="outline" className={cn("capitalize", variants[status])}>
        {status}
      </Badge>
    )
  }

  const getJobStatusBadge = (status: StreamJob["status"]) => {
    const variants: Record<StreamJob["status"], string> = {
      queued: "bg-muted text-muted-foreground border-border",
      pulling: "bg-info/10 text-info border-info/30",
      processing: "bg-warning/10 text-warning border-warning/30",
      completed: "bg-success/10 text-success border-success/30",
      failed: "bg-destructive/10 text-destructive border-destructive/30",
    }
    return (
      <Badge variant="outline" className={cn("capitalize", variants[status])}>
        {status}
      </Badge>
    )
  }

  const activeJobs = jobs.filter(
    (j) => j.status === "queued" || j.status === "pulling" || j.status === "processing"
  )

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Stream Sources</h1>
            <p className="mt-1 text-muted-foreground">
              Connect to live video feeds and APIs for real-time analysis
            </p>
          </div>

          {/* Supported Sources Info */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card className="bg-card border-border">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Radio className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">RTSP Streams</p>
                  <p className="text-xs text-muted-foreground">IP cameras & DVRs</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Wifi className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">HTTP Streams</p>
                  <p className="text-xs text-muted-foreground">HLS & DASH feeds</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                  <Code className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">REST APIs</p>
                  <p className="text-xs text-muted-foreground">Frame-by-frame data</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <Server className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">WebSockets</p>
                  <p className="text-xs text-muted-foreground">Real-time feeds</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="sources" className="space-y-6">
            <TabsList className="bg-muted">
              <TabsTrigger value="sources" className="flex items-center gap-2">
                <Radio className="h-4 w-4" />
                Sources
              </TabsTrigger>
              <TabsTrigger value="queue" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Processing Queue
                {activeJobs.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {activeJobs.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="results" className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Results
                {detections.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {detections.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Sources Tab */}
            <TabsContent value="sources" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Connected Stream Sources
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Add sources and pull videos for AI analysis
                  </p>
                </div>
                <Dialog open={isAddingSource} onOpenChange={setIsAddingSource}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Source
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add Stream Source</DialogTitle>
                      <DialogDescription>
                        Connect a new video stream or API endpoint for analysis
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Source Name</Label>
                        <Input
                          id="name"
                          placeholder="e.g., Downtown Traffic Cam"
                          value={newSource.name}
                          onChange={(e) =>
                            setNewSource((prev) => ({ ...prev, name: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="type">Source Type</Label>
                        <Select
                          value={newSource.type}
                          onValueChange={(value: StreamSource["type"]) =>
                            setNewSource((prev) => ({ ...prev, type: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rtsp">RTSP Stream</SelectItem>
                            <SelectItem value="http">HTTP/HTTPS Stream</SelectItem>
                            <SelectItem value="api">REST API</SelectItem>
                            <SelectItem value="websocket">WebSocket</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="url">Stream URL / API Endpoint</Label>
                        <Input
                          id="url"
                          placeholder="rtsp://example.com/stream or https://api.example.com/video"
                          value={newSource.url}
                          onChange={(e) =>
                            setNewSource((prev) => ({ ...prev, url: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddingSource(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddSource}
                        disabled={!newSource.name || !newSource.url}
                      >
                        Add Source
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Sources List */}
              <div className="space-y-3">
                {sources.map((source) => (
                  <Card key={source.id} className="bg-card border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-lg",
                            source.status === "active" ? "bg-success/10" : "bg-muted"
                          )}
                        >
                          <Radio
                            className={cn(
                              "h-6 w-6",
                              source.status === "active"
                                ? "text-success"
                                : "text-muted-foreground"
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-foreground truncate">
                              {source.name}
                            </h3>
                            {getStatusBadge(source.status)}
                            <Badge variant="outline" className="capitalize">
                              {source.type}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {source.url}
                          </p>
                          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                            {source.lastSync && (
                              <span>
                                Last sync:{" "}
                                {formatDistanceToNow(new Date(source.lastSync), {
                                  addSuffix: true,
                                })}
                              </span>
                            )}
                            {source.detectionCount !== undefined && (
                              <span>{source.detectionCount} detections</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => openPullDialog(source)}
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Pull Videos
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleToggleSource(source.id)}
                            title={source.status === "active" ? "Pause" : "Start"}
                          >
                            {source.status === "active" ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleRemoveSource(source.id)}
                            title="Remove"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {sources.length === 0 && (
                  <Card className="bg-card border-border">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Radio className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-foreground">No sources added</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Add a stream source to start pulling videos
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Processing Queue Tab */}
            <TabsContent value="queue" className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Processing Queue</h2>
                <p className="text-sm text-muted-foreground">
                  Monitor video pulls and AI processing progress
                </p>
              </div>

              <div className="space-y-3">
                {jobs.map((job) => (
                  <Card key={job.id} className="bg-card border-border">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-lg",
                            job.status === "completed"
                              ? "bg-success/10"
                              : job.status === "failed"
                              ? "bg-destructive/10"
                              : "bg-primary/10"
                          )}
                        >
                          {job.status === "completed" ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : job.status === "failed" ? (
                            <XCircle className="h-5 w-5 text-destructive" />
                          ) : (
                            <Loader2 className="h-5 w-5 text-primary animate-spin" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-foreground">{job.sourceName}</h3>
                            {getJobStatusBadge(job.status)}
                          </div>
                          <div className="mt-1">
                            <ModelBadges modelIds={job.selectedModels} />
                          </div>
                          
                          {(job.status === "pulling" || job.status === "processing") && (
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">
                                  {job.status === "pulling" ? "Pulling video..." : "Processing frames..."}
                                </span>
                                <span className="font-medium">{Math.round(job.progress)}%</span>
                              </div>
                              <Progress value={job.progress} className="h-2" />
                              {job.status === "processing" && (
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span>{job.framesProcessed} / {job.totalFrames} frames</span>
                                  <span>{job.detectionCount} detections found</span>
                                </div>
                              )}
                            </div>
                          )}

                          {job.status === "completed" && (
                            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{job.totalFrames} frames processed</span>
                              <span>{job.detectionCount} detections found</span>
                              {job.completedAt && (
                                <span>
                                  Completed{" "}
                                  {formatDistanceToNow(new Date(job.completedAt), {
                                    addSuffix: true,
                                  })}
                                </span>
                              )}
                            </div>
                          )}

                          {job.status === "queued" && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Waiting in queue...
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {jobs.length === 0 && (
                  <Card className="bg-card border-border">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Clock className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-foreground">No jobs in queue</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Pull videos from a source to start processing
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Results Tab */}
            <TabsContent value="results" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Detection Results</h2>
                  <p className="text-sm text-muted-foreground">
                    Review and validate detections from stream sources
                  </p>
                </div>
                {detections.length > 0 && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                    {detections.length} detections
                  </Badge>
                )}
              </div>

              {detections.length === 0 ? (
                <Card className="bg-card border-border">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">No results yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pull and process videos to see detections
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-card border-border">
                  <CardContent className="p-0">
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
                              <TableCell className="hidden lg:table-cell">
                                <span className="text-sm text-muted-foreground truncate max-w-[120px] block">
                                  {detection.videoSource}
                                </span>
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
                      <div className="flex items-center justify-between p-4 border-t border-border">
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
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Pull Videos Dialog */}
      <Dialog open={isPullDialogOpen} onOpenChange={setIsPullDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pull Videos for Analysis</DialogTitle>
            <DialogDescription>
              Select which detection models to run on videos from{" "}
              <span className="font-medium">{selectedSourceForPull?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ModelSelector
              selectedModels={pullModels}
              onSelectionChange={setPullModels}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPullDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePullVideos}
              disabled={pullModels.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Start Processing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div className="col-span-2">
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-medium">{selectedDetection.videoSource}</p>
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
