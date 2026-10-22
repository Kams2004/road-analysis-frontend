"use client"

import { useEffect, useState } from "react"
import { Check, Circle, AlertTriangle, TrafficCone, Car } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/lib/i18n"
import { listModels } from "@/lib/ai-models-api"
import { UI_TO_BACKEND_MODEL } from "@/lib/module7-api"

export type DetectionModel = {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
  /** Opt-in model: not in DEFAULT_MODEL_IDS (slower; see ops.models.<id>Hint). */
  optIn?: boolean
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
    name: "Traffic Signs",
    description: "Detect road signs (stop, speed limits…) and traffic lights",
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
  {
    id: "vehicles",
    name: "Parked vehicles",
    description: "Detect parked / roadside vehicles (uses the GPS track)",
    icon: <Car className="h-4 w-4" />,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30 hover:bg-violet-500/20",
    optIn: true,
  },
]

/** Initial selection of a new job / stream: every model except the opt-in ones (parked vehicles). */
export const DEFAULT_MODEL_IDS: string[] = AVAILABLE_MODELS.filter((m) => !m.optIn).map((m) => m.id)

// ── installed models (GET /models/ `present`) ───────────────────────────────
let installedPromise: Promise<Set<string> | null> | null = null

/** UI ids of the detectors whose weights file is installed on the server, or
 *  null when unknown (request failed / no permission) — then every model is offered. */
function loadInstalled(): Promise<Set<string> | null> {
  if (!installedPromise) {
    installedPromise = listModels()
      .then((out) => {
        const present = new Set(out.models.filter((m) => m.present && m.role === "detector").map((m) => m.key))
        return new Set(AVAILABLE_MODELS.filter((m) => present.has(UI_TO_BACKEND_MODEL[m.id] ?? m.id)).map((m) => m.id))
      })
      .catch(() => { installedPromise = null; return null })
  }
  return installedPromise
}

/** The selectable models: only the installed ones (all of them while unknown). */
export function useInstalledModels(): DetectionModel[] {
  const [installed, setInstalled] = useState<Set<string> | null>(null)
  useEffect(() => {
    let alive = true
    loadInstalled().then((s) => { if (alive) setInstalled(s) })
    return () => { alive = false }
  }, [])
  return installed ? AVAILABLE_MODELS.filter((m) => installed.has(m.id)) : AVAILABLE_MODELS
}

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
  const t = useT()
  const models = useInstalledModels()
  const modelIds = models.map((m) => m.id).join(",")

  // drop a selected model that is not installed (e.g. the defaults)
  useEffect(() => {
    const allowed = new Set(models.map((m) => m.id))
    const kept = selectedModels.filter((id) => allowed.has(id))
    if (kept.length !== selectedModels.length) onSelectionChange(kept)
  }, [modelIds, selectedModels.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

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
    onSelectionChange(models.map((m) => m.id))
  }

  const clearAll = () => {
    if (disabled) return
    onSelectionChange([])
  }

  const allSelected = models.length > 0 && models.every((m) => selectedModels.includes(m.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{t("ops.models.title")}</p>
        <button
          type="button"
          onClick={allSelected ? clearAll : selectAll}
          disabled={disabled}
          className={cn(
            "text-xs font-medium text-primary hover:underline",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {allSelected ? t("ops.upload.clearAll") : t("ops.models.selectAll")}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {models.map((model) => {
          const isSelected = selectedModels.includes(model.id)
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => toggleModel(model.id)}
              disabled={disabled}
              title={model.optIn ? t(`ops.models.${model.id}Hint`) : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                isSelected
                  ? model.color
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {model.icon}
              <span>{t(`ops.models.${model.id}`)}</span>
              {isSelected && <Check className="h-3.5 w-3.5 ml-1" />}
            </button>
          )
        })}
      </div>
      {models.some((m) => m.optIn && selectedModels.includes(m.id)) && (
        <p className="text-xs text-muted-foreground">
          {models.filter((m) => m.optIn && selectedModels.includes(m.id)).map((m) => t(`ops.models.${m.id}Hint`)).join(" ")}
        </p>
      )}
      {selectedModels.length === 0 && (
        <p className="text-xs text-destructive">{t("ops.models.required")}</p>
      )}
    </div>
  )
}

export function ModelBadges({ modelIds }: { modelIds: string[] }) {
  const t = useT()
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
            {t(`ops.models.${model.id}`)}
          </Badge>
        )
      })}
    </div>
  )
}
