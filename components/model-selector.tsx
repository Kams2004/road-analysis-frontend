"use client"

import { useState } from "react"
import { Check, Circle, AlertTriangle, TrafficCone } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export type DetectionModel = {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
}

export const AVAILABLE_MODELS: DetectionModel[] = [
  {
    id: "potholes",
    name: "Potholes",
    description: "Detect road potholes and surface damage",
    icon: <Circle className="h-4 w-4" />,
    color: "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20",
  },
  {
    id: "traffic_lights",
    name: "Traffic Lights",
    description: "Detect traffic lights and signal states",
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20",
  },
  {
    id: "speed_hump",
    name: "Speed Humps",
    description: "Detect speed humps and bumps",
    icon: <TrafficCone className="h-4 w-4" />,
    color: "bg-info/10 text-info border-info/30 hover:bg-info/20",
  },
]

interface ModelSelectorProps {
  selectedModels: string[]
  onSelectionChange: (models: string[]) => void
  disabled?: boolean
}

export function ModelSelector({
  selectedModels,
  onSelectionChange,
  disabled = false,
}: ModelSelectorProps) {
  const toggleModel = (modelId: string) => {
    if (disabled) return
    
    if (selectedModels.includes(modelId)) {
      onSelectionChange(selectedModels.filter((id) => id !== modelId))
    } else {
      onSelectionChange([...selectedModels, modelId])
    }
  }

  const selectAll = () => {
    if (disabled) return
    onSelectionChange(AVAILABLE_MODELS.map((m) => m.id))
  }

  const clearAll = () => {
    if (disabled) return
    onSelectionChange([])
  }

  const allSelected = selectedModels.length === AVAILABLE_MODELS.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Detection Models</p>
        <button
          type="button"
          onClick={allSelected ? clearAll : selectAll}
          disabled={disabled}
          className={cn(
            "text-xs font-medium text-primary hover:underline",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_MODELS.map((model) => {
          const isSelected = selectedModels.includes(model.id)
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => toggleModel(model.id)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                isSelected
                  ? model.color
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {model.icon}
              <span>{model.name}</span>
              {isSelected && <Check className="h-3.5 w-3.5 ml-1" />}
            </button>
          )
        })}
      </div>
      {selectedModels.length === 0 && (
        <p className="text-xs text-destructive">Please select at least one model</p>
      )}
    </div>
  )
}

export function ModelBadges({ modelIds }: { modelIds: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {modelIds.map((id) => {
        const model = AVAILABLE_MODELS.find((m) => m.id === id)
        if (!model) return null
        return (
          <Badge
            key={id}
            variant="outline"
            className={cn("text-xs", model.color)}
          >
            {model.name}
          </Badge>
        )
      })}
    </div>
  )
}
