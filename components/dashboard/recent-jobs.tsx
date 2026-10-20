"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { parseUtc, type DashboardData } from "./types"
import { EmptyState } from "./panel"

const STATUS_STYLE: Record<string, string> = {
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  processing: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  failed: "bg-red-500/10 text-red-700 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground",
}

const BAR_COLOR: Record<string, string> = {
  done: "bg-emerald-500",
  processing: "bg-blue-600",
  pending: "bg-amber-500",
  failed: "bg-red-500",
  cancelled: "bg-slate-400",
}

export function RecentJobs({ jobs }: { jobs: DashboardData["recent_jobs"] }) {
  const { t, locale } = useI18n()
  if (jobs.length === 0) return <EmptyState>{t("dash.jobs.empty")}</EmptyState>

  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-y border-border bg-muted/40 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">{t("dash.jobs.col.id")}</th>
            <th className="px-2 py-2 font-medium">{t("dash.jobs.col.source")}</th>
            <th className="px-2 py-2 font-medium">{t("dash.jobs.col.status")}</th>
            <th className="px-2 py-2 font-medium">{t("dash.jobs.col.progress")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("dash.jobs.col.created")}</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2">
                <Link href="/jobs" className="font-mono text-xs font-medium text-primary hover:underline">
                  #{j.id.slice(0, 8)}
                </Link>
              </td>
              <td className="max-w-[12rem] px-2 py-2">
                <p className="truncate text-foreground" title={j.source_name || j.filename}>{j.source_name || j.filename}</p>
                <p className="text-[11px] text-muted-foreground">{t(`dash.source.${j.source_type}`)}</p>
              </td>
              <td className="px-2 py-2">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[j.status] ?? STATUS_STYLE.cancelled)}>
                  {t(`ops.status.${j.status}`)}
                </span>
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", BAR_COLOR[j.status] ?? BAR_COLOR.cancelled)}
                      style={{ width: `${Math.max(0, Math.min(100, j.progress))}%` }}
                    />
                  </div>
                  <span className="w-9 text-xs tabular-nums text-muted-foreground">{Math.round(j.progress)}%</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted-foreground">
                {parseUtc(j.created_at).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
