"use client"

import type { LucideIcon } from "lucide-react"
import { Clock } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { useT } from "@/lib/i18n"
import { PageShell } from "./page-shell"

/** Placeholder for a CAMTRACK module that is specified but not built yet — no fake data. */
export function PlannedModule({ module, icon: Icon, titleKey, descKey }: {
  module: string
  icon: LucideIcon
  titleKey: string
  descKey: string
}) {
  const t = useT()
  return (
    <PageShell module={module}>
      <PageHeader title={t(titleKey)} />
      <div className="mx-auto mt-6 flex max-w-2xl flex-col items-center rounded-xl border border-border bg-card px-6 py-10 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Icon className="h-7 w-7" />
        </div>
        <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <Clock className="h-3 w-3" />
          {t("dash.planned.badge")}
        </span>
        <h2 className="mt-3 text-lg font-semibold text-foreground">{t(titleKey)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(descKey)}</p>
        <p className="mt-4 text-xs text-muted-foreground">{t("dash.planned.note")}</p>
      </div>
    </PageShell>
  )
}
