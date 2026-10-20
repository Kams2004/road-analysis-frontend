"use client"

/**
 * Sticky "On this page" index of the Settings page, plus deep-link support
 * (/settings#community): the cards load asynchronously, so the target is
 * looked up until it appears, then scrolled to and briefly highlighted.
 */
import { useEffect } from "react"
import Link from "next/link"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"
import { useT } from "@/lib/i18n"
import { settingsHrefForAnchor } from "@/lib/settings-structure"

export type SettingsAnchor = { id: string; label: string }
export type SettingsGroup = { label: string; items: SettingsAnchor[] }

const HIGHLIGHT = ["ring-2", "ring-primary/60"]

export function scrollToSettingsAnchor(id: string, tries = 40) {
  const el = document.getElementById(id)
  if (!el) {
    if (tries > 0) window.setTimeout(() => scrollToSettingsAnchor(id, tries - 1), 150)
    return
  }
  el.scrollIntoView({ behavior: "smooth", block: "start" })
  el.classList.add(...HIGHLIGHT)
  window.setTimeout(() => el.classList.remove(...HIGHLIGHT), 2000)
}

export function SettingsIndex({ groups }: { groups: SettingsGroup[] }) {
  const t = useT()

  useEffect(() => {
    const go = () => { const id = decodeURIComponent(window.location.hash.slice(1)); if (id) scrollToSettingsAnchor(id) }
    go()
    window.addEventListener("hashchange", go)
    return () => window.removeEventListener("hashchange", go)
  }, [])

  return (
    <nav
      aria-label={t("cm.idx.title")}
      className="sticky top-16 z-20 -mx-4 mb-5 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-xs [scrollbar-width:thin]">
        <span className="shrink-0 font-semibold text-foreground">{t("cm.idx.title")}</span>
        {groups.map((g) => (
          <div key={g.label} className="flex shrink-0 items-center gap-1">
            <span className="text-muted-foreground">{g.label}:</span>
            {g.items.map((a) => (
              <a
                key={a.id}
                href={`#${a.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  history.replaceState(null, "", `#${a.id}`)
                  scrollToSettingsAnchor(a.id)
                }}
                className="rounded-md border border-border px-2 py-0.5 text-foreground hover:bg-muted"
              >
                {a.label}
              </a>
            ))}
          </div>
        ))}
      </div>
    </nav>
  )
}

/** "Settings" button for a page header, deep-linking to its settings card. */
export function SettingsLinkButton({ anchor }: { anchor: string }) {
  const t = useT()
  const { can } = useAuth()
  if (!can("settings", "view")) return null
  return (
    <Button asChild variant="outline" size="sm" className="h-9 gap-2">
      <Link href={settingsHrefForAnchor(anchor) ?? "/settings"}>
        <Settings className="h-4 w-4" />
        {t("cm.settingsLink")}
      </Link>
    </Button>
  )
}
