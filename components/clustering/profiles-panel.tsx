"use client"

/** Global profiles: Urban (in agglomeration) / Out of agglomeration — default radius + per-type values. */
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Building2, ChevronRight, Loader2, Trees } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import {
  saveClusteringConfig, type ClusteringConfig, type Environment,
} from "@/lib/clustering-api"
import { RadiusTable, draftInvalid, fromDraft, toDraft, useTypeLabels, type RadiusDraft } from "./radius-table"

interface ProfileDraft { def: string; types: RadiusDraft; sigs: RadiusDraft }
interface Draft { urban: ProfileDraft; rural: ProfileDraft; unzoned: Environment; merge: boolean; corridor: string }

const toProfile = (c: ClusteringConfig, env: Environment): ProfileDraft => ({
  def: String(c[env].default_radius_m), types: toDraft(c[env].type_radius), sigs: toDraft(c[env].signalement_radius),
})
const toDraftAll = (c: ClusteringConfig): Draft => ({
  urban: toProfile(c, "urban"), rural: toProfile(c, "rural"), unzoned: c.unzoned_environment,
  merge: c.merge_signalements, corridor: String(c.default_corridor_width_m),
})

export function ProfilesPanel({ config, readOnly, onSaved }: {
  config: ClusteringConfig
  readOnly: boolean
  onSaved: (c: ClusteringConfig) => void
}) {
  const t = useT()
  const labels = useTypeLabels()
  const [draft, setDraft] = useState<Draft>(() => toDraftAll(config))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(toDraftAll(config)) }, [config])
  const initial = useMemo(() => JSON.stringify(toDraftAll(config)), [config])
  const dirty = JSON.stringify(draft) !== initial
  const { min_radius_m: min, max_radius_m: max } = config

  const invalid = (["urban", "rural"] as const).some((env) => {
    const p = draft[env]
    const d = Number(p.def)
    return !(d >= min && d <= max) || draftInvalid(p.types, min, max) || draftInvalid(p.sigs, min, max)
  }) || !(Number(draft.corridor) >= 20 && Number(draft.corridor) <= 5000)

  const setProfile = (env: Environment, patch: Partial<ProfileDraft>) =>
    setDraft((d) => ({ ...d, [env]: { ...d[env], ...patch } }))

  const save = async () => {
    setSaving(true)
    try {
      const prof = (env: Environment) => ({
        default_radius_m: Number(draft[env].def), type_radius: fromDraft(draft[env].types),
        signalement_radius: fromDraft(draft[env].sigs),
      })
      const saved = await saveClusteringConfig({
        urban: prof("urban"), rural: prof("rural"), unzoned_environment: draft.unzoned,
        merge_signalements: draft.merge, default_corridor_width_m: Number(draft.corridor),
      })
      onSaved(saved)
      toast.success(t("cl.saved"))
    } catch (e) {
      toast.error(errorText(t, e, "cl"))
    } finally {
      setSaving(false)
    }
  }

  const profileTab = (env: Environment) => {
    const p = draft[env]
    const def = Number(p.def) || config[env].default_radius_m
    return (
      <TabsContent value={env} className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">{t(env === "urban" ? "cl.profile.urbanDesc" : "cl.profile.ruralDesc")}</p>
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
          <div className="min-w-0">
            <Label className="text-xs font-semibold">{t("cl.defaultRadius")}</Label>
            <p className="text-[11px] text-muted-foreground">{t("cl.defaultRadiusHint")}</p>
          </div>
          <div className="flex items-center gap-1">
            <Input type="number" min={min} max={max} value={p.def} disabled={readOnly}
              onChange={(e) => setProfile(env, { def: e.target.value })}
              className={`h-8 w-24 text-right text-sm font-semibold ${!(Number(p.def) >= min && Number(p.def) <= max) ? "border-destructive" : ""}`}
              aria-label={t("cl.defaultRadius")} />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-foreground">{t("cl.detections")}</h4>
          <RadiusTable types={config.detection_types} label={labels.detection} values={p.types} readOnly={readOnly}
            onChange={(types) => setProfile(env, { types })} inherited={() => def} min={min} max={max} />
        </div>
        <details className="group space-y-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-foreground">
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
            {t("cl.signalements")}
            {Object.values(p.sigs).filter((v) => v.trim()).length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                {Object.values(p.sigs).filter((v) => v.trim()).length}
              </Badge>
            )}
          </summary>
          <div className="pt-1.5">
            <RadiusTable types={config.signalement_types} label={labels.signalement} values={p.sigs} readOnly={readOnly}
              onChange={(sigs) => setProfile(env, { sigs })} inherited={() => def} min={min} max={max} />
          </div>
        </details>
      </TabsContent>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="urban">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="urban" className="gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />{t("cl.urban")}</TabsTrigger>
          <TabsTrigger value="rural" className="gap-1.5 text-xs"><Trees className="h-3.5 w-3.5" />{t("cl.rural")}</TabsTrigger>
        </TabsList>
        {profileTab("urban")}
        {profileTab("rural")}
      </Tabs>

      <div className="space-y-3 rounded-md border px-3 py-2.5">
        <h4 className="text-xs font-semibold">{t("cl.general")}</h4>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-xs">{t("cl.unzoned")}</Label>
            <p className="text-[11px] text-muted-foreground">{t("cl.unzonedHint")}</p>
          </div>
          <Select value={draft.unzoned} onValueChange={(v) => setDraft((d) => ({ ...d, unzoned: v as Environment }))} disabled={readOnly}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rural">{t("cl.rural")}</SelectItem>
              <SelectItem value="urban">{t("cl.urban")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-xs">{t("cl.merge")}</Label>
            <p className="text-[11px] text-muted-foreground">{t("cl.mergeHint")}</p>
          </div>
          <Switch checked={draft.merge} onCheckedChange={(merge) => setDraft((d) => ({ ...d, merge }))} disabled={readOnly} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs">{t("cl.corridorDefault")}</Label>
          <div className="flex items-center gap-1">
            <Input type="number" min={20} max={5000} value={draft.corridor} disabled={readOnly}
              onChange={(e) => setDraft((d) => ({ ...d, corridor: e.target.value }))} className="h-8 w-24 text-right text-sm" />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-card py-2">
          {dirty ? <Badge variant="outline" className="border-warning/40 bg-warning/10 text-[11px] text-warning">{t("cl.unsaved")}</Badge> : <span />}
          <div className="flex gap-2">
            {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(toDraftAll(config))}>{t("cl.discard")}</Button>}
            <Button size="sm" onClick={save} disabled={!dirty || invalid || saving}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("cl.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
