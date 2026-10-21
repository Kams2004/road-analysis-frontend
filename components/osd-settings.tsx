"use client"

/**
 * Settings → Jobs → Dashcam overlay layouts (settings section `osd`, RRAP-05-014).
 * A profile mirrors the OSD configuration screen of a dashcam equipment: one row per
 * overlay field with its enabled flag and the X / Y of its top-left anchor on the
 * device's 0–1000 grid. Built-in profiles (`total`, `besafe`, `ola_energy`) can be
 * overridden (same name) or copied into a new one; the frame preview draws the OCR
 * regions derived from the anchors over an image the user picks (nothing uploaded).
 * See docs/OSD-LAYOUTS.md.
 */
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, ImageIcon, Loader2, Plus, RotateCcw, ScanText, Trash2 } from "lucide-react"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/components/auth-provider"
import { errorText } from "@/lib/auth-api"
import { useT } from "@/lib/i18n"
import {
  OSD_FIELD_KINDS, deriveOsdRois, getOsdLayouts, getOsdSettings, saveOsdSettings,
  type OsdField, type OsdFieldKind, type OsdLayoutInfo, type OsdProfile, type OsdSettings,
} from "@/lib/module7-api"

const SCOPE = "m7.osd"
const BUILTIN = ["total", "besafe", "ola_energy"]
const SELECT = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
const ROI_COLORS: Record<string, string> = {
  date_time: "#f59e0b", gps: "#ef4444", vehicle_no: "#3b82f6", user_def: "#8b5cf6", rpm: "#14b8a6",
  driver_id: "#64748b", driver_name: "#22c55e", channel: "#ec4899",
}

const toLines = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k} = ${v}`).join("\n")
const fromLines = (s: string) => Object.fromEntries(s.split("\n").map((l) => l.split("=").map((x) => x.trim()))
  .filter((p) => p.length === 2 && p[0] && p[1]) as [string, string][])

function profileOf(info: OsdLayoutInfo): OsdProfile {
  return {
    label: info.label, line_height: info.line_height, fields: info.fields.map((f) => ({ ...f })),
    date_formats: info.date_formats, timezone: info.timezone ?? null, detect: info.detect ?? true,
    aliases: info.aliases ?? [],
  }
}

function FramePreview({ profile }: { profile: OsdProfile }) {
  const t = useT()
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])
  const rois = deriveOsdRois(profile)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t(`${SCOPE}.preview`)}</p>
          <p className="text-xs text-muted-foreground">{t(`${SCOPE}.previewHint`)}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <label className="cursor-pointer">
            <ImageIcon className="h-4 w-4" />{t(`${SCOPE}.pickFrame`)}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setSrc(URL.createObjectURL(f))
            }} />
          </label>
        </Button>
      </div>
      <div className="relative w-full overflow-hidden rounded-md border bg-muted" style={{ aspectRatio: "720 / 576" }}>
        {src && <img src={src} alt="" className="absolute inset-0 h-full w-full object-fill" />}
        {rois.map((r) => (
          <div key={r.field} className="absolute border-2"
            style={{ left: `${r.box[0] * 100}%`, top: `${r.box[1] * 100}%`, width: `${(r.box[2] - r.box[0]) * 100}%`,
                     height: `${(r.box[3] - r.box[1]) * 100}%`, borderColor: ROI_COLORS[r.field] ?? "#ef4444" }}>
            <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap px-1 text-[10px] font-medium text-white"
              style={{ background: ROI_COLORS[r.field] ?? "#ef4444" }}>{t(`${SCOPE}.f.${r.field}`)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function OsdSettingsCard() {
  const t = useT()
  const { can } = useAuth()
  const readOnly = !can("settings", "edit")
  const [settings, setSettings] = useState<OsdSettings | null>(null)
  const [layouts, setLayouts] = useState<OsdLayoutInfo[]>([])
  const [profiles, setProfiles] = useState<Record<string, OsdProfile>>({})
  const [selected, setSelected] = useState<string>("total")
  const [defaultLayout, setDefaultLayout] = useState("auto")
  const [byVehicle, setByVehicle] = useState("")
  const [bySource, setBySource] = useState("")
  const [neighbourRetry, setNeighbourRetry] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    try {
      const [s, l] = await Promise.all([getOsdSettings(), getOsdLayouts()])
      setLayouts(l.layouts)
      if (s) {
        setSettings(s)
        setProfiles(JSON.parse(JSON.stringify(s.profiles ?? {})))
        setDefaultLayout(s.default_layout ?? "auto")
        setByVehicle(toLines(s.by_vehicle ?? {}))
        setBySource(toLines(s.by_source ?? {}))
        setNeighbourRetry(s.neighbour_retry ?? true)
      }
      setError(null)
    } catch (err) {
      setError(errorText(t, err, SCOPE))
    } finally {
      setLoaded(true)
    }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemo(() => Array.from(new Set([...layouts.map((l) => l.name), ...Object.keys(profiles)])),
    [layouts, profiles])
  const isBuiltinName = (n: string) => BUILTIN.includes(n)
  const info = layouts.find((l) => l.name === selected)
  const current: OsdProfile | null = profiles[selected] ?? (info ? profileOf(info) : null)

  const edit = (patch: Partial<OsdProfile>) => {
    if (!current) return
    setProfiles((p) => ({ ...p, [selected]: { ...current, ...patch } }))
  }
  const editField = (i: number, patch: Partial<OsdField>) => {
    if (!current) return
    edit({ fields: current.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  }
  const copyProfile = () => {
    if (!current) return
    const name = window.prompt(t(`${SCOPE}.newName`), `${selected}_2`)?.trim().toLowerCase()
    if (!name || !/^[a-z0-9][a-z0-9_-]{1,39}$/.test(name) || names.includes(name)) return
    setProfiles((p) => ({ ...p, [name]: { ...JSON.parse(JSON.stringify(current)), label: name, aliases: [] } }))
    setSelected(name)
  }
  const removeProfile = () => {
    setProfiles((p) => { const n = { ...p }; delete n[selected]; return n })
    if (!isBuiltinName(selected)) setSelected("total")
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveOsdSettings({
        default_layout: defaultLayout, profiles, by_vehicle: fromLines(byVehicle), by_source: fromLines(bySource),
        neighbour_retry: neighbourRetry,
      })
      toast.success(t(`${SCOPE}.saved`))
      await load()
    } catch (err) {
      toast.error(errorText(t, err, SCOPE))
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return <div className="flex min-h-[10vh] items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
  }
  return (
    <SectionCard id="osd-layouts" icon={ScanText} tone="blue" title={t(`${SCOPE}.title`)} description={t(`${SCOPE}.desc`)}>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="osd-default" className="text-xs font-medium">{t(`${SCOPE}.defaultLayout`)}</Label>
          <select id="osd-default" className={SELECT} value={defaultLayout} disabled={readOnly}
            onChange={(e) => setDefaultLayout(e.target.value)}>
            <option value="auto">{t(`${SCOPE}.auto`)}</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
            <option value="none">{t(`${SCOPE}.noOcr`)}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="osd-profile" className="text-xs font-medium">{t(`${SCOPE}.profile`)}</Label>
          <select id="osd-profile" className={SELECT} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>{n}{isBuiltinName(n) ? ` (${t(`${SCOPE}.builtin`)})` : ""}</option>
            ))}
          </select>
        </div>
      </div>

      {current && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{selected}</Badge>
            {profiles[selected] && <Badge variant="outline">{t(`${SCOPE}.custom`)}</Badge>}
            <div className="ml-auto flex flex-wrap gap-2">
              {!readOnly && <Button size="sm" variant="outline" className="gap-1.5" onClick={copyProfile}><Copy className="h-4 w-4" />{t(`${SCOPE}.newProfile`)}</Button>}
              {!readOnly && profiles[selected] && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={removeProfile}>
                  {isBuiltinName(selected) ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  {isBuiltinName(selected) ? t(`${SCOPE}.reset`) : t(`${SCOPE}.delete`)}
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t(`${SCOPE}.label`)}</Label>
              <Input value={current.label} disabled={readOnly} onChange={(e) => edit({ label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t(`${SCOPE}.lineHeight`)}</Label>
              <Input type="number" min={1} max={500} value={current.line_height} disabled={readOnly}
                onChange={(e) => edit({ line_height: Number(e.target.value) || 50 })} />
              <p className="text-xs text-muted-foreground">{t(`${SCOPE}.lineHeightHint`)}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t(`${SCOPE}.timezone`)}</Label>
              <Input value={current.timezone ?? ""} placeholder="Africa/Douala" disabled={readOnly}
                onChange={(e) => edit({ timezone: e.target.value.trim() || null })} />
              <p className="text-xs text-muted-foreground">{t(`${SCOPE}.timezoneHint`)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t(`${SCOPE}.dateFormats`)}</Label>
              <Input value={(current.date_formats ?? []).join(", ")} disabled={readOnly}
                onChange={(e) => edit({ date_formats: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
              <p className="text-xs text-muted-foreground">{t(`${SCOPE}.dateFormatsHint`)}</p>
            </div>
            <label className="flex items-center gap-2 self-center text-sm">
              <Checkbox checked={current.detect ?? true} disabled={readOnly} onCheckedChange={(v) => edit({ detect: v === true })} />
              {t(`${SCOPE}.detect`)}
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">{t(`${SCOPE}.field`)}</th>
                  <th className="py-1 pr-2">{t(`${SCOPE}.enabled`)}</th>
                  <th className="py-1 pr-2">{t(`${SCOPE}.x`)}</th>
                  <th className="py-1 pr-2">{t(`${SCOPE}.y`)}</th>
                  <th className="py-1 pr-2">{t(`${SCOPE}.width`)}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {current.fields.map((f, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-2">
                      <select className={SELECT} value={f.field} disabled={readOnly}
                        onChange={(e) => editField(i, { field: e.target.value as OsdFieldKind })}>
                        {OSD_FIELD_KINDS.map((k) => <option key={k} value={k}>{t(`${SCOPE}.f.${k}`)}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <Checkbox checked={f.enabled} disabled={readOnly} onCheckedChange={(v) => editField(i, { enabled: v === true })} />
                    </td>
                    <td className="py-1 pr-2"><Input type="number" min={0} max={1000} className="w-20" value={f.x} disabled={readOnly}
                      onChange={(e) => editField(i, { x: Number(e.target.value) })} /></td>
                    <td className="py-1 pr-2"><Input type="number" min={0} max={1000} className="w-20" value={f.y} disabled={readOnly}
                      onChange={(e) => editField(i, { y: Number(e.target.value) })} /></td>
                    <td className="py-1 pr-2"><Input type="number" min={1} max={1000} className="w-20" value={f.width ?? ""} placeholder="auto"
                      disabled={readOnly} onChange={(e) => editField(i, { width: e.target.value ? Number(e.target.value) : null })} /></td>
                    <td className="py-1">
                      {!readOnly && current.fields.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t(`${SCOPE}.delete`)}
                          onClick={() => edit({ fields: current.fields.filter((_, j) => j !== i) })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
              const used = new Set(current.fields.map((f) => f.field))
              const kind = OSD_FIELD_KINDS.find((k) => !used.has(k))
              if (kind) edit({ fields: [...current.fields, { field: kind, enabled: true, x: 20, y: 500 }] })
            }}><Plus className="h-4 w-4" />{t(`${SCOPE}.addField`)}</Button>
          )}
          <FramePreview profile={current} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="osd-veh" className="text-xs font-medium">{t(`${SCOPE}.byVehicle`)}</Label>
          <Textarea id="osd-veh" rows={3} className="font-mono text-xs" value={byVehicle} disabled={readOnly}
            placeholder="LTTR704AC = besafe" onChange={(e) => setByVehicle(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t(`${SCOPE}.byVehicleHint`)}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="osd-src" className="text-xs font-medium">{t(`${SCOPE}.bySource`)}</Label>
          <Textarea id="osd-src" rows={3} className="font-mono text-xs" value={bySource} disabled={readOnly}
            placeholder="sftp = total" onChange={(e) => setBySource(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t(`${SCOPE}.bySourceHint`)}</p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={neighbourRetry} disabled={readOnly} onCheckedChange={(v) => setNeighbourRetry(v === true)} />
        {t(`${SCOPE}.neighbourRetry`)}
      </label>
      {!readOnly && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
    </SectionCard>
  )
}
