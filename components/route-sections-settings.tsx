"use client"

/**
 * Settings → "Predefined road sections" (settings section `routes`): the
 * tronçons offered by the route searches of the Detection map, Historical
 * risk analysis and Community reporting pages. Each row has a name and two
 * endpoints, picked with the place search and fine-tunable by coordinates.
 */
import { useEffect, useMemo, useState } from "react"
import { Loader2, Lock, Plus, Route, Trash2 } from "lucide-react"
import { SectionCard } from "@/components/section-card"
import { SaveBar, useSectionForm, type Form } from "@/components/platform-settings"
import { PlaceAutocomplete } from "@/components/place-autocomplete"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-provider"
import { errorText, getPlatformSettings, type PlatformSettings } from "@/lib/auth-api"
import { invalidateRouteSections, type RouteEndpoint, type RouteSection } from "@/lib/routes-api"
import { useT } from "@/lib/i18n"

type RoutesData = PlatformSettings["routes"]

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section"

function uniqueId(base: string, taken: Set<string>) {
  let id = base, n = 2
  while (taken.has(id)) id = `${base}-${n++}`
  return id
}

const validCoord = (e: RouteEndpoint) =>
  Number.isFinite(e.lat) && Number.isFinite(e.lon) && Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180

function EndpointEditor({ label, value, onChange, readOnly, idBase }: {
  label: string; value: RouteEndpoint; onChange: (e: RouteEndpoint) => void; readOnly: boolean; idBase: string
}) {
  const t = useT()
  const num = (raw: string) => (raw.trim() === "" ? NaN : Number(raw))
  // Stable object: PlaceAutocomplete re-syncs its text whenever `value` changes.
  const place = useMemo(
    () => (validCoord(value) ? { label: value.label, lat: value.lat, lon: value.lon } : null),
    [value.label, value.lat, value.lon], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {readOnly ? (
        <p className="truncate text-sm">{value.label || "—"}</p>
      ) : (
        <PlaceAutocomplete
          id={`${idBase}-place`} compact
          value={place}
          onChange={(p) => { if (p) onChange({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), label: p.label }) }}
          placeholder={t("rt.fromPh")}
        />
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <Input
          className="h-7 px-1.5 text-xs" value={value.label} disabled={readOnly}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          aria-label={`${label} — ${t("rt.set.label")}`} placeholder={t("rt.set.label")}
        />
        <Input
          type="number" step="0.0001" className="h-7 px-1.5 text-right text-xs tabular-nums"
          value={Number.isFinite(value.lat) ? value.lat : ""} disabled={readOnly}
          onChange={(e) => onChange({ ...value, lat: num(e.target.value) })}
          aria-label={`${label} — lat`} placeholder="lat"
        />
        <Input
          type="number" step="0.0001" className="h-7 px-1.5 text-right text-xs tabular-nums"
          value={Number.isFinite(value.lon) ? value.lon : ""} disabled={readOnly}
          onChange={(e) => onChange({ ...value, lon: num(e.target.value) })}
          aria-label={`${label} — lon`} placeholder="lon"
        />
      </div>
    </div>
  )
}

function RouteSectionsCard({ data, onSaved, readOnly }: {
  data: RoutesData; onSaved: (v: RoutesData) => void; readOnly: boolean
}) {
  const t = useT()
  const form = useSectionForm("routes", data, [], (v) => { invalidateRouteSections(); onSaved(v) }) as unknown as Form
  const rows = (form.values.sections ?? []) as RouteSection[]
  const setRows = (next: RouteSection[]) => form.set("sections", next)
  const update = (i: number, patch: Partial<RouteSection>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const savedIds = useMemo(() => new Set(data.sections.map((s) => s.id)), [data])
  // A new row takes its id from its name once named (saved ids never change).
  const nameDone = (i: number) => {
    const r = rows[i]
    if (savedIds.has(r.id) || !r.name.trim()) return
    const taken = new Set(rows.filter((_, j) => j !== i).map((x) => x.id))
    const id = uniqueId(slug(r.name), taken)
    if (id !== r.id) update(i, { id })
  }

  const add = () => {
    const taken = new Set(rows.map((r) => r.id))
    const name = t("rt.set.newName")
    setRows([...rows, {
      id: uniqueId(slug(name), taken), name,
      from: { lat: NaN, lon: NaN, label: "" }, to: { lat: NaN, lon: NaN, label: "" },
    }])
  }

  const invalid = rows.some((r) => !r.name.trim() || !validCoord(r.from) || !validCoord(r.to))

  return (
    <SectionCard id="routes" className="xl:col-span-2" icon={Route} tone="teal"
                 title={t("rt.set.title")} description={t("rt.set.desc")}>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {t("rt.set.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const bad = !r.name.trim() || !validCoord(r.from) || !validCoord(r.to)
            return (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(10rem,1fr)_2fr_2fr_auto] lg:items-start">
                  <div className="space-y-1.5">
                    <Label htmlFor={`rs-name-${i}`} className="text-[11px] text-muted-foreground">{t("rt.set.name")}</Label>
                    <Input
                      id={`rs-name-${i}`} className="h-8 text-sm" value={r.name} disabled={readOnly}
                      onChange={(e) => update(i, { name: e.target.value })}
                      onBlur={() => nameDone(i)}
                    />
                    <p className="truncate font-mono text-[10px] text-muted-foreground" title={r.id}>{r.id}</p>
                  </div>
                  <EndpointEditor idBase={`rs-${i}-from`} label={t("hist.route.from")} value={r.from}
                                  onChange={(from) => update(i, { from })} readOnly={readOnly} />
                  <EndpointEditor idBase={`rs-${i}-to`} label={t("hist.route.to")} value={r.to}
                                  onChange={(to) => update(i, { to })} readOnly={readOnly} />
                  {!readOnly && (
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-8 w-8 self-end text-destructive hover:bg-destructive/10 lg:self-center"
                      title={t("rt.set.delete")} aria-label={t("rt.set.delete")}
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {bad && <p className="mt-1.5 text-xs text-destructive">{t("rt.set.invalid")}</p>}
              </li>
            )
          })}
        </ul>
      )}
      <SaveBar form={invalid ? { ...form, dirty: false } : form} readOnly={readOnly} t={t}>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" className="mr-auto gap-1.5" onClick={add}>
            <Plus className="h-4 w-4" /> {t("rt.set.add")}
          </Button>
        )}
      </SaveBar>
    </SectionCard>
  )
}

export function RouteSectionsSettingsSection() {
  const t = useT()
  const { can } = useAuth()
  const readOnly = !can("settings", "edit")
  const [data, setData] = useState<RoutesData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    getPlatformSettings()
      .then((d) => setData(d.routes ?? { sections: [] }))
      .catch((err) => setError(errorText(t, err, "account.platform")))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!data) {
    return (
      <div className="flex min-h-[10vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {readOnly && (
        <Alert><Lock className="h-4 w-4" /><AlertDescription>{t("account.platform.readOnly")}</AlertDescription></Alert>
      )}
      <RouteSectionsCard data={data} onSaved={setData} readOnly={readOnly} />
    </div>
  )
}
