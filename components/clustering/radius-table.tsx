"use client"

/** Compact per-type radius table (empty cell = inherit, shown as the placeholder). */
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n"

export type RadiusDraft = Record<string, string>

export const toDraft = (m: Record<string, number> | null | undefined): RadiusDraft =>
  Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [k, String(v)]))

/** Draft → {type: radius}; invalid / empty cells are dropped. */
export const fromDraft = (d: RadiusDraft): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(d)) {
    const n = v.trim() === "" ? NaN : Number(v)
    if (Number.isFinite(n) && n > 0) out[k] = n
  }
  return out
}

export const draftInvalid = (d: RadiusDraft, min: number, max: number) =>
  Object.values(d).some((v) => v.trim() !== "" && !(Number(v) >= min && Number(v) <= max))

export function useTypeLabels() {
  const t = useT()
  const tl = (key: string, fallback: string) => { const s = t(key); return s === key ? fallback : s }
  return {
    detection: (ty: string) => tl(`pmap.type.${ty}`, ty.replaceAll("_", " ")),
    signalement: (ty: string) => tl(`pmap.sig.type.${ty}`, ty.replaceAll("_", " ")),
  }
}

export function RadiusTable({
  types, label, values, onChange, inherited, readOnly, min = 1, max = 10000,
}: {
  types: string[]
  label: (type: string) => string
  values: RadiusDraft
  onChange: (next: RadiusDraft) => void
  /** Value used when the cell is empty (shown as placeholder). */
  inherited: (type: string) => number
  readOnly?: boolean
  min?: number
  max?: number
}) {
  const t = useT()
  return (
    <div className="divide-y rounded-md border">
      {types.map((ty) => {
        const v = values[ty] ?? ""
        const bad = v.trim() !== "" && !(Number(v) >= min && Number(v) <= max)
        return (
          <div key={ty} className="flex items-center justify-between gap-2 px-2.5 py-1">
            <span className="min-w-0 truncate text-xs">{label(ty)}</span>
            <div className="flex shrink-0 items-center gap-1">
              <Input
                type="number" inputMode="decimal" min={min} max={max} value={v} disabled={readOnly}
                placeholder={t("cl.inherits", { v: inherited(ty) })}
                onChange={(e) => onChange({ ...values, [ty]: e.target.value })}
                className={`h-7 w-28 text-right text-xs ${bad ? "border-destructive" : ""} ${v ? "font-semibold" : ""}`}
                aria-label={label(ty)}
              />
              <span className="w-3 text-[11px] text-muted-foreground">m</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
