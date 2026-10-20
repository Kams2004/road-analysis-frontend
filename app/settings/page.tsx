"use client"

/**
 * Settings overview: every requirement module with its submodules (one page
 * each, see lib/settings-structure.ts). Former deep links to the single
 * settings page (/settings#community) are redirected to the page that now
 * holds that card.
 */
import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { SettingsShell } from "@/components/settings/settings-shell"
import { IconTile } from "@/components/section-card"
import { SETTINGS_MODULES, settingsHrefForAnchor } from "@/lib/settings-structure"
import { useT } from "@/lib/i18n"

export default function SettingsOverviewPage() {
  const t = useT()
  const router = useRouter()

  useEffect(() => {
    const anchor = decodeURIComponent(window.location.hash.slice(1))
    const href = anchor ? settingsHrefForAnchor(anchor) : null
    if (href) router.replace(href)
  }, [router])

  return (
    <SettingsShell title={t("pmap.set.title")} description={t("set.overview.desc")} readOnlyNotice={false}>
      {SETTINGS_MODULES.map((m) => (
        <section key={m.id} className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t(m.labelKey)}</h2>
            <p className="text-xs text-muted-foreground">{t(m.descKey)}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {m.pages.map((p) => (
              <Link key={p.id} href={p.href}
                className="group flex items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/50">
                <IconTile icon={p.icon} tone={p.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{t(p.labelKey)}</span>
                  <span className="block text-xs text-muted-foreground">{t(p.descKey)}</span>
                </span>
                <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </SettingsShell>
  )
}
