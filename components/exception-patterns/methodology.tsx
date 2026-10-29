"use client"

/** How the exception statistics are computed (severity rule, bands, zone criteria), editable with
 *  settings:edit — settings section `driver_behaviour` (key kept), no driver scoring any more. */
import { useEffect, useState } from "react"
import { BookOpen, ChevronDown, Loader2, Pencil, Save, X } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SEVERITIES, getMethodology, type ExceptionPatternSettings, type Methodology } from "@/lib/exception-patterns-api"
import { saveSettingsSection } from "@/lib/settings-api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const NUMS: (keyof ExceptionPatternSettings)[] = [
  "speeding_medium_excess_pct", "speeding_high_excess_pct", "zone_cell_size_m", "zone_min_events",
]

export function MethodologyPanel({ onSaved }: { onSaved?: () => void }) {
  const { t } = useI18n()
  const { can } = useAuth()
  const canEdit = can("settings", "edit")
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Methodology | null>(null)
  const [draft, setDraft] = useState<ExceptionPatternSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open || data) return
    getMethodology().then(setData).catch((e: Error) => setError(e.message))
  }, [open, data])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const { severity_multipliers, speeding_medium_excess_pct, speeding_high_excess_pct, zone_cell_size_m, zone_min_events } = draft
      await saveSettingsSection("driver_behaviour", {
        severity_multipliers, speeding_medium_excess_pct, speeding_high_excess_pct, zone_cell_size_m, zone_min_events,
      })
      setData(await getMethodology())
      setDraft(null)
      setSaved(true)
      onSaved?.()
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const s = draft ?? data?.settings
  const num = (v: string) => (v === "" ? 0 : Number(v))

  return (
    <section className="mt-4 rounded-xl border border-border bg-card shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-muted-foreground" />{t("xp.method.title")}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
          {!data && !error && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {data && s && (
            <>
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
                <span className="font-semibold">{t("xp.method.severityRule")}: </span>
                {t("xp.method.rule", { high: s.speeding_high_excess_pct, medium: s.speeding_medium_excess_pct })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("xp.method.version", { v: data.version, tz: s.timezone })} ·{" "}
                {t("xp.method.bands", { speed: data.speed_bands_kmh.join(", "), excess: data.excess_bands_pct.join(", ") })}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold">{t("xp.method.criteria")}</p>
                  {NUMS.map((k) => (
                    <Row key={k} label={t(`xp.method.${k}`)} value={s[k] as number} edit={!!draft}
                      onChange={(v) => setDraft({ ...draft!, [k]: num(v) })} />
                  ))}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold">{t("xp.method.severity")}</p>
                  {SEVERITIES.map((k) => (
                    <Row key={k} label={t(`xp.sev.${k}`)} value={s.severity_multipliers[k] ?? 1} edit={!!draft}
                      onChange={(v) => setDraft({ ...draft!, severity_multipliers: { ...draft!.severity_multipliers, [k]: num(v) } })} />
                  ))}
                </div>
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
                <li>{t("xp.method.note1")}</li>
                <li>{t("xp.method.note2")}</li>
                <li>{t("xp.method.note3")}</li>
              </ul>
              {canEdit && (
                <div className="flex items-center gap-2">
                  {!draft ? (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDraft(structuredClone(data.settings))}>
                      <Pencil className="h-3.5 w-3.5" />{t("xp.method.edit")}
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" className="gap-1.5" onClick={save} disabled={saving}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{t("xp.method.save")}
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setDraft(null); setError(null) }}>
                        <X className="h-3.5 w-3.5" />{t("xp.method.cancel")}
                      </Button>
                    </>
                  )}
                  {saved && <span className="text-xs text-emerald-600">{t("xp.method.saved")}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function Row({ label, value, edit, onChange }: { label: string; value: number; edit: boolean; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {edit ? (
        <Input type="number" step="any" className="h-7 w-24 text-right" value={String(value)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <span className="tabular-nums text-foreground">{value}</span>
      )}
    </div>
  )
}
