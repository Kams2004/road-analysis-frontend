"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, File, X, CheckCircle, AlertCircle, Loader2, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { VideoUpload } from "@/lib/types"

interface VideoUploaderProps {
  onUploadComplete?: (upload: VideoUpload) => void
}

export function VideoUploader({ onUploadComplete }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState<VideoUpload[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const simulateUpload = useCallback(
    (file: File) => {
      const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const newUpload: VideoUpload = {
        id: uploadId,
        filename: file.name,
        status: "uploading",
        progress: 0,
        uploadedAt: new Date().toISOString(),
      }

      setUploads((prev) => [newUpload, ...prev])

      // Simulate upload progress
      let progress = 0
      const uploadInterval = setInterval(() => {
        progress += Math.random() * 15
        if (progress >= 100) {
          progress = 100
          clearInterval(uploadInterval)

          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, progress: 100, status: "processing" }
                : u
            )
          )

          // Simulate processing
          setTimeout(() => {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId
                  ? {
                      ...u,
                      status: "completed",
                      detectionCount: Math.floor(Math.random() * 20) + 5,
                    }
                  : u
              )
            )
            if (onUploadComplete) {
              const completed = uploads.find((u) => u.id === uploadId)
              if (completed) onUploadComplete(completed)
            }
          }, 2000)
        } else {
          setUploads((prev) =>
            prev.map((u) => (u.id === uploadId ? { ...u, progress } : u))
          )
        }
      }, 200)
    },
    [onUploadComplete, uploads]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("video/")
      )

      files.forEach(simulateUpload)
    },
    [simulateUpload]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      files.forEach(simulateUpload)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    },
    [simulateUpload]
  )

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id))
  }, [])

  const getStatusIcon = (status: VideoUpload["status"]) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-warning" />
      case "completed":
        return <CheckCircle className="h-4 w-4 text-success" />
      case "failed":
        return <AlertCircle className="h-4 w-4 text-destructive" />
    }
  }

  const getStatusText = (upload: VideoUpload) => {
    switch (upload.status) {
      case "uploading":
        return `Uploading... ${Math.round(upload.progress)}%`
      case "processing":
        return "Processing with AI models..."
      case "completed":
        return `Complete - ${upload.detectionCount} detections found`
      case "failed":
        return "Upload failed"
    }
  }

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-xl border-2 border-dashed p-12 text-center transition-all",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full transition-colors",
              isDragging ? "bg-primary/20" : "bg-muted"
            )}
          >
            <Video
              className={cn(
                "h-8 w-8 transition-colors",
                isDragging ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">
              Drop video files here
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              or click to browse from your computer
            </p>
          </div>
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="mt-2"
          >
            <Upload className="mr-2 h-4 w-4" />
            Select Files
          </Button>
          <p className="text-xs text-muted-foreground">
            Supported formats: MP4, MOV, AVI, MKV (max 2GB)
          </p>
        </div>
      </div>

      {/* Upload Queue */}
      {uploads.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Upload Queue</h3>
          <div className="space-y-2">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <File className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {upload.filename}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {getStatusIcon(upload.status)}
                    <span className="text-xs text-muted-foreground">
                      {getStatusText(upload)}
                    </span>
                  </div>
                  {(upload.status === "uploading" ||
                    upload.status === "processing") && (
                    <Progress
                      value={upload.status === "processing" ? 100 : upload.progress}
                      className="mt-2 h-1"
                    />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => removeUpload(upload.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
