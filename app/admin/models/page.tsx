"use client"

/**
 * Administration → AI models (RRAP-05-010/012/016, RRAP-13-016): the model
 * slots with their model cards (GET /models/) and the live quality of the
 * AI validation measured against human decisions (GET /models/stats).
 * Permission settings:view.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  BrainCircuit, CheckCircle2, ClipboardCheck, Gauge, Loader2, RefreshCw, RotateCcw, ScanSearch, ShieldCheck, XCircle,
} from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { RequirePermission } from "@/components/require-permission"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { SectionCard } from "@/components/section-card"
import { useM6Labels } from "@/components/m6-shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorText } from "@/lib/auth-api"
import {
  getModelStats, listModels, type EffectiveThresholds, type EffectiveValue, type ModelCard, type ModelSlot, type ModelsOut,
  type StatsOut, type StatsWindow,
} from "@/lib/ai-models-api"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { signLabel } from "@/lib/i18n/extra/traffic-signs"

export default function AiModelsPage() {
  const { t } = useM6Labels()
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <PageHeader title={t("ai.models.title")} description={t("ai.models.subtitle")} />
          <RequirePermission module="settings">
            <AiModels />
          </RequirePermission>
        </div>
      </main>
    </div>
  )
}

function AiModels() {
  const L = useM6Labels()
  const { t } = L
  const [models, setModels] = useState<ModelsOut | null>(null)
  const [stats, setStats] = useState<StatsOut | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(7)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, s] = await Promise.all([listModels(), getModelStats()])
      setModels(m)
      setStats(s)
    } catch (err) {
      setError(errorText(t, err, "m6"))
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const win = stats?.windows.find((w) => w.days === days) ?? stats?.windows[0]

  if (error) return <Alert><AlertDescription>{error}</AlertDescription></Alert>
  if (!models || !stats) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }
  const ai = models.ai_validation
  // only the models whose weights file is installed are shown
  const installed = models.models.filter((m) => m.present)
  const missing = models.models.length - installed.length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1"><BrainCircuit className="h-3.5 w-3.5" />{t("ai.set.mode")}: {t(`ai.mode.${ai.mode}`)}</Badge>
        {ai.mode !== "manual" && (
          <Badge variant="outline">{t("ai.models.auditRate", { pct: Math.round(ai.audit_sample_rate * 100) })}</Badge>
        )}
        {ai.mode !== "manual" && (
          <Badge variant="outline">{ai.require_classifier_agreement ? t("ai.models.agreeOn") : t("ai.models.agreeOff")}</Badge>
        )}
        <Button asChild size="sm" variant="link" className="h-7 px-1"><Link href="/settings/ai">{t("ai.models.editSettings")}</Link></Button>
        <div className="ml-auto flex items-center gap-1">
          {stats.windows.map((w) => (
            <Button key={w.days} size="sm" variant={w.days === win?.days ? "default" : "outline"} className="h-8"
              onClick={() => setDays(w.days)}>{t("ai.models.lastDays", { n: w.days })}</Button>
          ))}
          <Button size="sm" variant="outline" className="h-8" onClick={load} disabled={loading} aria-label={t("ai.refresh")}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {win && <QualityTiles w={win} />}

      <SectionCard icon={Gauge} tone="teal" title={t("ai.models.byVersion")} description={t("ai.models.byVersionHint")}
        contentClassName="p-0">
        {!win || win.by_model.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t("ai.models.noStats")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{t("ai.models.detector")}</TableHead>
                  <TableHead>{t("ai.models.classifier")}</TableHead>
                  <TableHead className="text-right">{t("ai.decision.auto_accept")}</TableHead>
                  <TableHead className="text-right">{t("ai.decision.auto_reject")}</TableHead>
                  <TableHead className="text-right">{t("ai.decision.review")}</TableHead>
                  <TableHead className="text-right">{t("ai.models.workload")}</TableHead>
                  <TableHead className="text-right">{t("ai.models.auditAgreement")}</TableHead>
                  <TableHead className="text-right">{t("ai.models.acceptPrecision")}</TableHead>
                  <TableHead className="text-right">{t("ai.models.reopenAgreement")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {win.by_model.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">
                      {m.model_name && L.tl(`ai.slot.${m.model_name}`, "") && (
                        <div className="text-muted-foreground">{L.tl(`ai.slot.${m.model_name}`, m.model_name)}</div>
                      )}
                      <div className="font-medium">{m.model_card_version ?? m.model_name ?? "—"}</div>
                      <div className="font-mono text-muted-foreground">{m.model_version ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.verifier_model ? (
                        <>
                          <div className="font-medium">{m.verifier_card_version ?? t("ai.models.noCard")}</div>
                          <div className="font-mono text-muted-foreground">{m.verifier_model}</div>
                        </>
                      ) : <span className="text-muted-foreground">{t("ai.singleStage")}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.auto_accept}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.auto_reject}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.review}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.workload_pct == null ? "—" : `${m.workload_pct}%`}</TableCell>
                    <TableCell className="text-right tabular-nums">{rateWithN(L.pct, m.audit.agreement_rate, m.audit.decided)}</TableCell>
                    <TableCell className="text-right tabular-nums">{rateWithN(L.pct, m.auto_accept_precision, m.auto_accept_audited)}</TableCell>
                    <TableCell className="text-right tabular-nums">{rateWithN(L.pct, m.reopened.agreement_rate, m.reopened.decided)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        {installed.map((m) => <ModelCardView key={m.key} slot={m} models={models} />)}
      </div>
      {missing > 0 && <p className="text-xs text-muted-foreground">{t("ai.models.notInstalled", { n: missing })}</p>}
    </div>
  )
}

const rateWithN = (pct: (v: number | null | undefined) => string, rate: number | null, n: number) =>
  rate == null ? "—" : `${pct(rate)} (n=${n})`

function QualityTiles({ w }: { w: StatsWindow }) {
  const { t, pct } = useM6Labels()
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard icon={ScanSearch} tone="blue" value={w.total}
        label={t("ai.models.decisions", { a: w.auto_accept, r: w.auto_reject, v: w.review })} />
      <StatCard icon={Gauge} tone="orange" value={w.workload_pct == null ? "—" : `${w.workload_pct}%`} label={t("ai.models.workload")} />
      <StatCard icon={ClipboardCheck} tone="purple" value={pct(w.audit.agreement_rate)}
        label={t("ai.models.auditAgreementN", { n: w.audit.decided, s: w.audit_samples })} />
      <StatCard icon={ShieldCheck} tone="green" value={pct(w.auto_accept_precision)}
        label={t("ai.models.acceptPrecisionN", { n: w.auto_accept_audited })} />
      <StatCard icon={RotateCcw} tone="slate" value={pct(w.reopened.agreement_rate)}
        label={t("ai.models.reopenedN", { n: w.reopened.count })} />
    </div>
  )
}

function fmtMetric(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
  if (v == null) return "—"
  return typeof v === "object" ? JSON.stringify(v) : String(v)
}

function ModelCardView({ slot, models }: { slot: ModelSlot; models: ModelsOut }) {
  const L = useM6Labels()
  const { t } = L
  const card = slot.card
  const eff = models.thresholds[slot.detection_type]
  const fields = slot.role === "classifier" ? (["auto_accept", "auto_reject"] as const) : (["detector_accept", "detector_reject"] as const)
  const allMetrics = card ? Object.entries(card.metrics ?? {}).filter(([k, v]) => k !== "per_class" && (v == null || typeof v !== "object")) : []
  // Short values as chips; long texts (decision rule, notes) as wrapped lines under them.
  const isNote = (v: unknown) => typeof v === "string" && v.length > 32
  const globalMetrics = allMetrics.filter(([, v]) => !isNote(v))
  const metricNotes = allMetrics.filter(([, v]) => isNote(v))
  return (
    <SectionCard icon={slot.role === "classifier" ? ShieldCheck : ScanSearch} tone={slot.role === "classifier" ? "purple" : "blue"}
      title={<>{t(`ai.slot.${slot.key}`)}{card && <span className="ml-2 font-mono text-xs text-muted-foreground">{card.name}:{card.version}</span>}</>}
      badge={<>
        <Badge variant="outline" className="text-[10px]">{t(`ai.role.${slot.role}`)}</Badge>
        {slot.pipeline && (
          <Badge variant="secondary" className="text-[10px]">{t(`ai.pipeline.${slot.pipeline}`)}</Badge>
        )}
        {slot.present
          ? <Badge className="gap-1 bg-success/20 text-success hover:bg-success/20 text-[10px]"><CheckCircle2 className="h-3 w-3" />{t("ai.models.loaded")}</Badge>
          : <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground"><XCircle className="h-3 w-3" />{t("ai.models.missing")}</Badge>}
      </>}
      description={<span className="font-mono">{slot.version ?? slot.path ?? "—"}</span>}>
      {!slot.present ? (
        <p className="text-sm text-muted-foreground">
          {slot.role === "classifier"
            ? (slot.detection_type === "traffic_sign" ? t("ai.models.missingClassifier.signs") : t("ai.models.missingClassifier"))
            : t("ai.models.missingDetector")}
        </p>
      ) : !card ? (
        <Alert><AlertDescription>{slot.card_error ? t("ai.models.cardInvalid", { e: slot.card_error }) : t("ai.models.noCardHint")}</AlertDescription></Alert>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("ai.card.created")}</dt><dd>{L.fmtDate(card.created_at ?? null)}</dd>
            <dt className="text-muted-foreground">{t("ai.card.framework")}</dt><dd>{card.framework ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("ai.card.base")}</dt><dd className="break-all">{fmtMetric(card.base)}</dd>
            <dt className="text-muted-foreground">{t("ai.card.classes")}</dt><dd>{card.classes.join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">{t("ai.card.imgsz")}</dt><dd>{card.imgsz ?? "—"}</dd>
            {card.crop_pad_ratio != null && (<>
              <dt className="text-muted-foreground">{t("ai.card.cropPad")}</dt><dd>{fmtMetric(card.crop_pad_ratio)}</dd>
            </>)}
            {card.taxonomy_version && (<>
              <dt className="text-muted-foreground">{t("ai.card.taxonomy")}</dt><dd className="font-mono text-xs">{card.taxonomy_version}</dd>
            </>)}
            <dt className="text-muted-foreground">SHA-256</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{slot.sha256?.slice(0, 16)}…</span>
              {slot.sha256_matches_card === true && <Badge className="bg-success/20 text-success hover:bg-success/20 text-[10px]">{t("ai.card.shaOk")}</Badge>}
              {slot.sha256_matches_card === false && <Badge variant="destructive" className="text-[10px]">{t("ai.card.shaMismatch")}</Badge>}
            </dd>
          </dl>

          {allMetrics.length > 0 && (
            <div className="min-w-0 space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground">{t("ai.card.metrics")}</h4>
              {globalMetrics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {globalMetrics.map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="max-w-full whitespace-normal break-all font-normal">
                      <span className="mr-1 text-muted-foreground">{k}</span>{fmtMetric(v)}
                    </Badge>
                  ))}
                </div>
              )}
              {metricNotes.length > 0 && (
                <dl className="space-y-1 rounded-md bg-muted/50 p-2.5 text-xs">
                  {metricNotes.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="font-medium text-muted-foreground">{k}</dt>
                      <dd className="whitespace-pre-wrap break-words">{fmtMetric(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">{t("ai.card.thresholds")}</h4>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Badge variant="outline">{t("ai.card.cardAccept")} {fmtMetric(card.thresholds.auto_accept)}</Badge>
              <Badge variant="outline">{t("ai.card.cardReject")} {fmtMetric(card.thresholds.auto_reject)}</Badge>
              {card.thresholds.reject_class && (
                <Badge variant="outline">{t("ai.card.rejectClass")} <span className="ml-1 font-mono">{card.thresholds.reject_class}</span></Badge>
              )}
              {card.thresholds.target_precision != null && (
                <Badge variant="outline">{t("ai.card.targetPrecision")} {L.pct(card.thresholds.target_precision)}</Badge>
              )}
              {eff && fields.map((f) => (
                <Badge key={f} variant="secondary">
                  {t(`ai.th.${f}`)} {fmtMetric(eff[f].value)} · {eff[f].source ? t(`ai.src.${eff[f].source}`) : t("ai.src.none")}
                </Badge>
              ))}
            </div>
          </div>

          {(slot.role === "classifier" || hasPerClass(card)) && slot.detection_type === "traffic_sign" && (
            <PerClassTable slot={slot} eff={eff} />
          )}

          {card.datasets.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground">{t("ai.card.datasets")}</h4>
              <ul className="space-y-1 text-xs">
                {card.datasets.map((d, i) => (
                  <li key={i} className="rounded border px-2 py-1">
                    <span className="font-medium">{d.name ?? "—"}</span>
                    {d.images != null && <span className="text-muted-foreground"> · {t("ai.card.images", { n: d.images })}</span>}
                    {d.source && <span className="block break-all text-muted-foreground">{d.source}</span>}
                    {d.license_note && <span className="block text-muted-foreground">{d.license_note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

const hasPerClass = (card: ModelCard) =>
  !!(card.thresholds?.per_class && Object.keys(card.thresholds.per_class).length) ||
  !!(card.metrics?.per_class && Object.keys(card.metrics.per_class).length)

const METRIC_ORDER = ["precision", "recall", "f1", "support"]

/** Per sign code: card thresholds, effective thresholds (+ source) and the card's per-class metrics. */
function PerClassTable({ slot, eff }: { slot: ModelSlot; eff: EffectiveThresholds | undefined }) {
  const L = useM6Labels()
  const { t } = L
  const { lang } = useI18n()
  const card = slot.card!
  const cardTh = card.thresholds?.per_class ?? {}
  const metrics = (card.metrics?.per_class ?? {}) as Record<string, Record<string, unknown>>
  const effTh = eff?.per_class ?? {}
  const codes = Array.from(new Set([...Object.keys(cardTh), ...Object.keys(metrics), ...Object.keys(effTh)]))
    .sort((a, b) => signLabel(a, lang).localeCompare(signLabel(b, lang), lang))
  const metricKeys = Array.from(new Set(Object.values(metrics).flatMap((m) =>
    Object.entries(m ?? {}).filter(([, v]) => typeof v === "number").map(([k]) => k))))
    .sort((a, b) => {
      const ia = METRIC_ORDER.indexOf(a), ib = METRIC_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
    })
  const effCell = (v: EffectiveValue | undefined) => v == null || v.value == null ? "—" : (
    <span>{fmtMetric(v.value)} <span className="text-[10px] text-muted-foreground">· {v.source ? t(`ai.src.${v.source}`) : t("ai.src.none")}</span></span>
  )
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-muted-foreground">{t("ai.perClass.title")}</h4>
      {codes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("ai.perClass.empty")}</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("ai.perClass.code")}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t("ai.perClass.cardAccept")}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t("ai.perClass.cardReject")}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t("ai.perClass.effAccept")}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{t("ai.perClass.effReject")}</TableHead>
                {metricKeys.map((k) => <TableHead key={k} className="text-right">{k}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((code) => (
                <TableRow key={code}>
                  <TableCell className="text-xs">
                    <div className="font-medium">{signLabel(code, lang)}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{code}</div>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMetric(cardTh[code]?.auto_accept)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtMetric(cardTh[code]?.auto_reject)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">{effCell(effTh[code]?.auto_accept)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">{effCell(effTh[code]?.auto_reject)}</TableCell>
                  {metricKeys.map((k) => (
                    <TableCell key={k} className="text-right text-xs tabular-nums">{fmtMetric(metrics[code]?.[k])}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
