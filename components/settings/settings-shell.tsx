"use client"

/**
 * Frame of every settings page: app sidebar + top bar, permission gate
 * (settings:view), a secondary navigation grouped by requirement module →
 * submodule (left rail on large screens, a select on small ones), a page
 * header and a read-only notice for users without settings:edit. Deep links
 * (#card-id) scroll to the card once it has loaded.
 */
import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { PageHeader } from "@/components/page-header"
import { RequirePermission } from "@/components/require-permission"
import { scrollToSettingsAnchor } from "@/components/settings-index"
import { useAuth } from "@/components/auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SETTINGS_MODULES, SETTINGS_PAGES } from "@/lib/settings-structure"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function useSettingsReadOnly() {
  const { can } = useAuth()
  return !can("settings", "edit")
}

export function SettingsShell({ title, description, actions, readOnlyNotice = true, children }: {
  title?: React.ReactNode
  /** false when the page's own sections already show the read-only notice. */
  readOnlyNotice?: boolean
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const t = useT()
  const pathname = usePathname()
  const router = useRouter()
  const readOnly = useSettingsReadOnly()
  const current = SETTINGS_PAGES.find((p) => p.href === pathname)

  useEffect(() => {
    const go = () => { const id = decodeURIComponent(window.location.hash.slice(1)); if (id) scrollToSettingsAnchor(id) }
    go()
    window.addEventListener("hashchange", go)
    return () => window.removeEventListener("hashchange", go)
  }, [pathname])

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <Topbar />
        <RequirePermission module="settings">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row">
              {/* Secondary navigation: module → submodule */}
              <nav aria-label={t("set.nav.title")} className="hidden w-56 shrink-0 lg:block">
                <div className="sticky top-20 space-y-4">
                  <Link href="/settings" className={cn("block rounded-md px-2 py-1.5 text-sm font-semibold",
                    pathname === "/settings" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
                    {t("set.nav.overview")}
                  </Link>
                  {SETTINGS_MODULES.map((m) => (
                    <div key={m.id} className="space-y-0.5">
                      <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t(m.labelKey)}</p>
                      {m.pages.map((p) => {
                        const active = p.href === pathname
                        const Icon = p.icon
                        return (
                          <Link key={p.id} href={p.href} aria-current={active ? "page" : undefined}
                            className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                              active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t(p.labelKey)}</span>
                          </Link>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </nav>

              <div className="min-w-0 flex-1">
                {/* Small screens: the same navigation as a select */}
                <div className="mb-4 lg:hidden">
                  <Select value={current?.href ?? "/settings"} onValueChange={(v) => router.push(v)}>
                    <SelectTrigger className="h-9 w-full" aria-label={t("set.nav.title")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="/settings">{t("set.nav.overview")}</SelectItem>
                      {SETTINGS_MODULES.map((m) => (
                        <SelectGroup key={m.id}>
                          <SelectLabel>{t(m.labelKey)}</SelectLabel>
                          {m.pages.map((p) => <SelectItem key={p.id} value={p.href}>{t(p.labelKey)}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <PageHeader
                  title={title ?? (current ? t(current.labelKey) : t("pmap.set.title"))}
                  description={description ?? (current ? t(current.descKey) : undefined)}
                  actions={actions}
                />
                {readOnly && readOnlyNotice && (
                  <Alert className="mb-4">
                    <Lock className="h-4 w-4" />
                    <AlertDescription>{t("account.platform.readOnly")}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-5">{children}</div>
              </div>
            </div>
          </div>
        </RequirePermission>
      </main>
    </div>
  )
}
