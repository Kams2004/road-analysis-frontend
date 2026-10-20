"use client"

/** Zone attributes + local overrides (empty = inherit the environment profile). */
import { useState } from "react"
import { ChevronRight, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/lib/i18n"
import type { ClusterZone, ClusteringConfig, Environment, RadiusMap, ZoneKind } from "@/lib/clustering-api"
import { RadiusTable, draftInvalid, fromDraft, toDraft, useTypeLabels, type RadiusDraft } from "./radius-table"

export interface ZoneFormValues {
  name: string
  environment: Environment
  priority: number | null
  is_active: boolean
  default_radius_m: number | null
  type_radius: RadiusMap | null
  signalement_radius: RadiusMap | null
  city: string | null
}

export const DEFAULT_PRIORITY: Record<ZoneKind, number> = { agglomeration: 10, custom: 10, road_section: 0 }

export function ZoneForm({
  kind, zone, initialName = "", initialEnv, config, readOnly, saving, onSubmit, onCancel, children, submitDisabled,
}: {
  kind: ZoneKind
  zone?: ClusterZone | null
  initialName?: string
  initialEnv?: Environment
  config: ClusteringConfig
  readOnly?: boolean
  saving?: boolean
  onSubmit: (v: ZoneFormValues) => void
  onCancel: () => void
  /** Kind-specific fields shown above the overrides. */
  children?: React.ReactNode
  submitDisabled?: boolean
}) {
  const t = useT()
  const labels = useTypeLabels()
  const [name, setName] = useState(zone?.name ?? initialName)
  const [env, setEnv] = useState<Environment>(zone?.environment ?? initialEnv ?? (kind === "road_section" ? "rural" : "urban"))
  const [priority, setPriority] = useState(String(zone?.priority ?? DEFAULT_PRIORITY[kind]))
  const [active, setActive] = useState(zone?.is_active ?? true)
  const [def, setDef] = useState(zone?.default_radius_m != null ? String(zone.default_radius_m) : "")
  const [types, setTypes] = useState<RadiusDraft>(toDraft(zone?.type_radius))
  const [sigs, setSigs] = useState<RadiusDraft>(toDraft(zone?.signalement_radius))
  const [city, setCity] = useState(zone?.city ?? "")
  const { min_radius_m: min, max_radius_m: max } = config
  const prof = config[env]
  const zoneDef = def.trim() ? Number(def) : null
  const defBad = def.trim() !== "" && !(Number(def) >= min && Number(def) <= max)
  const prBad = priority.trim() !== "" && !(Number.isInteger(Number(priority)) && Math.abs(Number(priority)) <= 1000)
  const invalid = !name.trim() || defBad || prBad || draftInvalid(types, min, max) || draftInvalid(sigs, min, max)
  const nSigs = Object.values(sigs).filter((v) => v.trim()).length

  const submit = () => {
    const tr = fromDraft(types), sr = fromDraft(sigs)
    onSubmit({
      name: name.trim(), environment: env, is_active: active,
      priority: priority.trim() === "" ? null : Number(priority),
      default_radius_m: zoneDef, type_radius: Object.keys(tr).length ? tr : null,
      signalement_radius: Object.keys(sr).length ? sr : null, city: city.trim() || null,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">{t("cl.form.name")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} className="h-8 text-sm" maxLength={120} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("cl.form.env")}</Label>
          <Select value={env} onValueChange={(v) => setEnv(v as Environment)} disabled={readOnly}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="urban">{t("cl.urban")}</SelectItem>
              <SelectItem value="rural">{t("cl.rural")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs" title={t("cl.form.priorityHint")}>{t("cl.form.priority")}</Label>
          <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={readOnly}
            className={`h-8 text-sm ${prBad ? "border-destructive" : ""}`} title={t("cl.form.priorityHint")} />
        </div>
        {kind !== "road_section" && (
          <div className="space-y-1">
            <Label className="text-xs">{t("cl.form.city")}</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} disabled={readOnly} className="h-8 text-sm" />
          </div>
        )}
        <div className="flex items-end gap-2 pb-1.5">
          <Switch checked={active} onCheckedChange={setActive} disabled={readOnly} id="zone-active" />
          <Label htmlFor="zone-active" className="text-xs">{t("cl.form.active")}</Label>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("cl.form.priorityHint")}</p>

      {children}

      <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
        <h4 className="text-xs font-semibold">{t("cl.form.overrides")}</h4>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">{t("cl.form.default")}</Label>
          <div className="flex items-center gap-1">
            <Input type="number" min={min} max={max} value={def} onChange={(e) => setDef(e.target.value)} disabled={readOnly}
              placeholder={t("cl.inherits", { v: prof.default_radius_m })}
              className={`h-7 w-28 text-right text-xs ${defBad ? "border-destructive" : ""} ${def ? "font-semibold" : ""}`} />
            <span className="w-3 text-[11px] text-muted-foreground">m</span>
          </div>
        </div>
        <h5 className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("cl.detections")}</h5>
        <RadiusTable types={config.detection_types} label={labels.detection} values={types} onChange={setTypes}
          readOnly={readOnly} min={min} max={max}
          inherited={(ty) => zoneDef ?? prof.type_radius[ty] ?? prof.default_radius_m} />
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />{t("cl.signalements")}
            {nSigs > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{nSigs}</Badge>}
          </summary>
          <div className="pt-1.5">
            <RadiusTable types={config.signalement_types} label={labels.signalement} values={sigs} onChange={setSigs}
              readOnly={readOnly} min={min} max={max}
              inherited={(ty) => zoneDef ?? prof.signalement_radius[ty] ?? prof.default_radius_m} />
          </div>
        </details>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>{t("cl.form.cancel")}</Button>
        {!readOnly && (
          <Button size="sm" onClick={submit} disabled={invalid || saving || submitDisabled}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("cl.form.save")}
          </Button>
        )}
      </div>
    </div>
  )
}
