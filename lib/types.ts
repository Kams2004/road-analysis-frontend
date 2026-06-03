export type DetectionType =
  | "pothole"
  | "traffic_sign"
  | "speed_bump"
  | "speed_hump"
  | "crack"
  | "debris"
  | "road_damage"
  | "missing_sign"

export type DetectionSeverity = "low" | "medium" | "high" | "critical"

export type ValidationStatus = "pending" | "validated" | "rejected"

export interface GeoLocation {
  latitude: number
  longitude: number
  address?: string
}

export interface Detection {
  id: string
  type: DetectionType
  severity: DetectionSeverity
  confidence: number
  location: GeoLocation
  timestamp: string
  frameUrl: string
  videoSource: string
  validationStatus: ValidationStatus
  boundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  notes?: string
}

export interface VideoUpload {
  id: string
  filename: string
  status: "uploading" | "processing" | "completed" | "failed"
  progress: number
  uploadedAt: string
  detectionCount?: number
  detections?: Detection[]
}

export interface StreamSource {
  id: string
  name: string
  url: string
  type: "rtsp" | "http" | "api" | "websocket"
  status: "active" | "inactive" | "error"
  lastSync?: string
  detectionCount?: number
}

export interface StreamJob {
  id: string
  sourceId: string
  sourceName: string
  status: "queued" | "pulling" | "processing" | "completed" | "failed"
  progress: number
  framesProcessed: number
  totalFrames: number
  detectionCount: number
  startedAt: string
  completedAt?: string
  error?: string
}

export interface AnalyticsSummary {
  totalDetections: number
  pendingValidations: number
  validatedRiskZones: number
  detectionsByType: Record<DetectionType, number>
  detectionsBySeverity: Record<DetectionSeverity, number>
  recentActivity: {
    date: string
    count: number
  }[]
}
