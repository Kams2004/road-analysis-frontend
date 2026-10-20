"use client"

/**
 * Community votes on reports (signalements): inline counters, the per-report
 * "Votes" drawer (voters, distance, counted / invalid reason, pass-bys) and
 * the "suspected false testifiers" card. Community reports are validated by
 * these votes — AI detections have their own review flow (Validations).
 */
import { useEffect, useState } from "react"
import { AlertTriangle, EyeOff, Footprints, Loader2, ThumbsDown, ThumbsUp, UserX } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/status-badge"
import { SectionCard } from "@/components/section-card"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import {
  fetchFlaggedVoters, fetchSignalementVotes,
  type ApiSignalement, type FlaggedVoter, type SignalementVoteList,
} from "@/lib/api"

const parseUtc = (iso: string) => new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z")
const metres = (m: number | null) => (m === null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

/** 👍 present · 👎 absent · ⚠ invalid · 👁 ignored — counted votes only for the first two. */
export function VoteCounts({ s, className }: { s: ApiSignalement; className?: string }) {
  const { t } = useI18n()
  const item = (Icon: typeof ThumbsUp, n: number, label: string, tone: string) => (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", n ? tone : "text-muted-foreground/60")} title={label}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{label}: </span>{n}
    </span>
  )
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-xs", className)}>
      {item(ThumbsUp, s.present_count ?? 0, t("cm.sig.present"), "text-emerald-600 dark:text-emerald-400")}
      {item(ThumbsDown, s.absent_count ?? 0, t("cm.sig.absent"), "text-orange-600 dark:text-orange-400")}
      {item(AlertTriangle, s.invalid_vote_count ?? 0, t("cm.sig.invalid"), "text-red-600 dark:text-red-400")}
      {item(EyeOff, s.ignore_count ?? 0, t("cm.sig.ignores"), "text-slate-600 dark:text-slate-300")}
    </span>
  )
}

/** Uncertain / Expired flags shown next to the status. */
export function FreshnessBadges({ s }: { s: ApiSignalement }) {
  const { t } = useI18n()
  return (
    <>
      {s.uncertain && (
        <span title={t("cm.sig.uncertainHint", { n: s.ignore_count ?? 0 })}>
          <StatusBadge tone="amber" className="ml-1">{t("cm.sig.uncertain")}</StatusBadge>
        </span>
      )}
      {s.expired && <StatusBadge tone="slate" className="ml-1">{t("cm.sig.expired")}</StatusBadge>}
    </>
  )
}

export function VotesSheet({ signalement, onClose }: { signalement: ApiSignalement | null; onClose: () => void }) {
  const { t, locale } = useI18n()
  const [data, setData] = useState<SignalementVoteList | null>(null)
  const [error, setError] = useState(false)
  const fmt = (iso: string) => parseUtc(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "medium" })

  useEffect(() => {
    if (!signalement) return
    setData(null)
    setError(false)
    fetchSignalementVotes(signalement.id).then(setData).catch(() => setError(true))
  }, [signalement])

  return (
    <Sheet open={!!signalement} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t("cm.sig.votesTitle")}</SheetTitle>
          <SheetDescription>
            {t("cm.sig.votesDesc", { m: data?.vote_max_distance_m ?? "…" })}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {error && <p className="text-sm text-destructive">{t("cm.sig.loadFailed")}</p>}
          {!data && !error && (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { icon: ThumbsUp, n: data.present_count, label: t("cm.sig.present"), tone: "text-emerald-600" },
                  { icon: ThumbsDown, n: data.absent_count, label: t("cm.sig.absent"), tone: "text-orange-600" },
                  { icon: AlertTriangle, n: data.invalid_vote_count, label: t("cm.sig.invalid"), tone: "text-red-600" },
                  { icon: EyeOff, n: data.ignore_count, label: t("cm.sig.ignores"), tone: "text-slate-600" },
                ].map(({ icon: Icon, n, label, tone }) => (
                  <div key={label} className="rounded-lg border border-border px-3 py-2">
                    <div className={cn("flex items-center gap-1.5 text-lg font-semibold tabular-nums", tone)}>
                      <Icon className="h-4 w-4" />{n}
                    </div>
                    <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {data.uncertain && (
                <StatusBadge tone="amber">{t("cm.sig.uncertainHint", { n: data.ignore_count })}</StatusBadge>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>{t("cm.sig.voter")}</TableHead>
                      <TableHead>{t("cm.sig.vote")}</TableHead>
                      <TableHead className="text-right">{t("cm.sig.distance")}</TableHead>
                      <TableHead>{t("cm.sig.result")}</TableHead>
                      <TableHead>{t("cm.sig.time")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((v) => (
                      <TableRow key={v.id} className={cn(!v.counted && v.reason !== "duplicate" && "bg-red-500/5")}>
                        <TableCell className="max-w-[12rem] truncate text-xs" title={v.voter ?? ""}>
                          {v.voter ?? <span className="text-muted-foreground">{t("cm.sig.anonymous")}</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {v.vote === "present"
                            ? <span className="inline-flex items-center gap-1 text-emerald-600"><ThumbsUp className="h-3.5 w-3.5" />{t("cm.sig.present")}</span>
                            : <span className="inline-flex items-center gap-1 text-orange-600"><ThumbsDown className="h-3.5 w-3.5" />{t("cm.sig.absent")}</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{metres(v.distance_m)}</TableCell>
                        <TableCell className="text-xs">
                          {v.counted
                            ? <StatusBadge tone="green">{t("cm.sig.counted")}</StatusBadge>
                            : <StatusBadge tone={v.reason === "duplicate" ? "slate" : "red"}>{t(`cm.sig.reason.${v.reason}`)}</StatusBadge>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmt(v.created_at)}</TableCell>
                      </TableRow>
                    ))}
                    {!data.items.length && (
                      <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">{t("cm.sig.noVotes")}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <h4 className="flex items-center gap-1.5 text-sm font-medium"><Footprints className="h-4 w-4" />{t("cm.sig.passes")}</h4>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableBody>
                      {data.passes.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="max-w-[12rem] truncate text-xs" title={p.voter ?? ""}>{p.voter ?? "—"}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{metres(p.distance_m)}</TableCell>
                          <TableCell className="text-xs">
                            {!p.counted
                              ? <StatusBadge tone="slate">{t("cm.sig.outOfRange")}</StatusBadge>
                              : p.voted
                                ? <StatusBadge tone="green">{t("cm.sig.voted")}</StatusBadge>
                                : <StatusBadge tone="amber">{t("cm.sig.ignored")}</StatusBadge>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmt(p.created_at)}</TableCell>
                        </TableRow>
                      ))}
                      {!data.passes.length && (
                        <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">{t("cm.sig.noPasses")}</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function FlaggedVotersCard({ refreshKey }: { refreshKey?: unknown }) {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState<FlaggedVoter[] | null>(null)
  useEffect(() => { fetchFlaggedVoters(20).then(setRows).catch(() => setRows([])) }, [refreshKey])
  return (
    <SectionCard icon={UserX} tone="red" title={t("cm.sig.flagged")} description={t("cm.sig.flaggedDesc")}
                 contentClassName="px-0 py-0">
      {rows === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !rows.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("cm.sig.flaggedEmpty")}</p>
      ) : (
        <Table>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.voter_user_id}-${r.voter_device_id}`}>
                <TableCell className="max-w-[16rem] truncate pl-5 text-xs" title={r.voter ?? ""}>
                  {r.voter ?? t("cm.sig.anonymous")}
                </TableCell>
                <TableCell className="text-xs">
                  <StatusBadge tone="red">{t("cm.sig.invalidOf", { n: r.invalid_votes, total: r.total_votes })}</StatusBadge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{t("cm.sig.reports", { n: r.reports })}</TableCell>
                <TableCell className="whitespace-nowrap pr-5 text-right text-xs text-muted-foreground">
                  {parseUtc(r.last_vote_at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  )
}
