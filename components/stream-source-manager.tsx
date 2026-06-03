"use client"

import { useState } from "react"
import {
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StreamSource } from "@/lib/types"
import { mockStreamSources } from "@/lib/mock-data"
import { formatDistanceToNow } from "date-fns"

export function StreamSourceManager() {
  const [sources, setSources] = useState<StreamSource[]>(mockStreamSources)
  const [isAddingSource, setIsAddingSource] = useState(false)
  const [newSource, setNewSource] = useState({
    name: "",
    url: "",
    type: "rtsp",
  })

  const handleAddSource = () => {
    const source: StreamSource = {
      id: `stream-${Date.now()}`,
      name: newSource.name,
      url: newSource.url,
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

  const getStatusIcon = (status: StreamSource["status"]) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-success" />
      case "inactive":
        return <XCircle className="h-4 w-4 text-muted-foreground" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />
    }
  }

  const getStatusBadge = (status: StreamSource["status"]) => {
    const variants: Record<StreamSource["status"], string> = {
      active: "bg-success/20 text-success border-success/30",
      inactive: "bg-muted text-muted-foreground border-border",
      error: "bg-destructive/20 text-destructive border-destructive/30",
    }
    return (
      <Badge variant="outline" className={cn("capitalize", variants[status])}>
        {status}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Connected Stream Sources
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect to live video feeds and APIs for real-time analysis
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
                  onValueChange={(value) =>
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
          <div
            key={source.id}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card/80"
          >
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
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-foreground truncate">
                  {source.name}
                </h3>
                {getStatusBadge(source.status)}
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
                variant="outline"
                size="icon"
                onClick={() => handleToggleSource(source.id)}
                title={source.status === "active" ? "Pause" : "Start"}
              >
                {source.status === "active" ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleRemoveSource(source.id)}
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {sources.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
            <Radio className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium text-foreground">
              No stream sources
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a stream source to start analyzing live video feeds
            </p>
            <Button
              className="mt-4"
              onClick={() => setIsAddingSource(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Source
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
