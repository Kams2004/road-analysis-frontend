"use client"

/**
 * Sign-code picker of the Validations "Correct" dialog (two-stage sign
 * pipeline): the classifier's top-3 candidates as one-click chips, then the
 * full taxonomy (GET /models/signs/taxonomy, built-in list as fallback) as a
 * searchable list grouped by family, names in the UI language.
 */
import { useEffect, useMemo, useState } from "react"
import { Check, Loader2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/lib/i18n"
import { getSignTaxonomy } from "@/lib/ai-models-api"
import { BUILTIN_SIGN_TAXONOMY, signFamilyLabel, signLabel, type SignClass, type SignTaxonomy } from "@/lib/i18n/extra/traffic-signs"
import { cn } from "@/lib/utils"

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function SignPicker({ value, onChange, candidates, extraCodes = [] }: {
  value: string | null
  onChange: (code: string) => void
  candidates?: { code: string; score: number }[] | null
  /** Codes to offer even when the taxonomy does not list them (e.g. a legacy subtype). */
  extraCodes?: string[]
}) {
  const { t, lang } = useI18n()
  const [tx, setTx] = useState<SignTaxonomy | null>(null)
  const [q, setQ] = useState("")

  useEffect(() => {
    let alive = true
    getSignTaxonomy().then((x) => { if (alive) setTx(x) })
    return () => { alive = false }
  }, [])

  const nameOf = (c: SignClass) => (lang === "fr" ? c.name_fr || c.name_en : c.name_en || c.name_fr) || signLabel(c.code, lang)

  const groups = useMemo(() => {
    if (!tx) return []
    const classes: SignClass[] = [...tx.classes]
    for (const code of extraCodes) {
      if (code && !classes.some((c) => c.code === code)) {
        classes.push({ code, family: "other", name_en: signLabel(code, "en"), name_fr: signLabel(code, "fr") })
      }
    }
    const needle = fold(q.trim())
    const match = (c: SignClass) => !needle || fold(`${c.code} ${c.name_en} ${c.name_fr}`).includes(needle)
    const famOrder = [...tx.families.map((f) => f.code)]
    for (const c of classes) if (!famOrder.includes(c.family)) famOrder.push(c.family)
    return famOrder
      .map((fam) => ({
        fam,
        label: signFamilyLabel(tx.families.find((f) => f.code === fam), fam, lang),
        items: classes.filter((c) => c.family === fam && match(c)),
      }))
      .filter((g) => g.items.length > 0)
  }, [tx, q, lang, extraCodes.join("|")]) // eslint-disable-line react-hooks/exhaustive-deps

  const cands = (candidates ?? []).filter((c) => c && c.code).slice(0, 3)

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>{t("sign.picker.label")}</Label>
      {cands.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("sign.picker.candidates")}</p>
          <div className="flex flex-wrap gap-1.5">
            {cands.map((c) => (
              <button key={c.code} type="button" onClick={() => onChange(c.code)}
                title={c.code}
                className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  value === c.code ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                {value === c.code && <Check className="h-3 w-3" />}
                {signLabel(c.code, lang)}
                <span className="tabular-nums text-muted-foreground">· {Math.round(c.score * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("sign.picker.search")} className="h-9 pl-8"
          aria-label={t("sign.picker.search")} />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border" role="listbox" aria-label={t("sign.picker.label")}>
        {!tx ? (
          <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />{t("sign.picker.loading")}
          </p>
        ) : groups.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("sign.picker.none")}</p>
        ) : groups.map((g) => (
          <div key={g.fam}>
            <p className="sticky top-0 z-10 border-b bg-muted/80 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
              {g.label}
            </p>
            {g.items.map((c) => (
              <button key={c.code} type="button" role="option" aria-selected={value === c.code} onClick={() => onChange(c.code)}
                className={cn("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                  value === c.code ? "bg-primary/10 text-primary" : "hover:bg-muted/60")}>
                <span>{nameOf(c)}</span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  {c.code}{value === c.code && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {tx === BUILTIN_SIGN_TAXONOMY && <p className="text-[11px] text-muted-foreground">{t("sign.picker.builtin")}</p>}
      {value && <p className="text-xs text-muted-foreground">{t("sign.picker.selected", { name: signLabel(value, lang) })}</p>}
    </div>
  )
}
