"use client"

/**
 * Top bar above every console page: quick page search, notifications
 * (pending validations / running jobs), theme, language and the user menu.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Bell, Briefcase, CalendarDays, CheckCircle, LogOut, Moon, Search, Settings, Sun, UserCog } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/components/auth-provider"
import { LanguageSelect } from "@/components/language-select"
import { adminNavigation, navigation } from "@/components/sidebar"
import { useT } from "@/lib/i18n"
import { PERIODS, setPeriod, usePeriod, type Period } from "@/components/dashboard/period"

interface TopbarStats {
  pending_validations: number
  active_jobs: number
}

interface PageEntry {
  href: string
  label: string
  icon: typeof Search
}

export function Topbar() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/95 pl-16 pr-4 backdrop-blur sm:gap-3 sm:pr-6 lg:pl-8 lg:pr-8">
      <PageSearch />
      {/* The date range only drives the dashboard, so it only shows there. */}
      {pathname === "/" && <PeriodSelect />}
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <Notifications />
        <SettingsLink />
        <ThemeToggle />
        <LanguageSelect compact />
        <UserMenu />
      </div>
    </header>
  )
}

function PeriodSelect() {
  const t = useT()
  const period = usePeriod()
  return (
    <label className="relative flex shrink-0 items-center">
      <span className="sr-only">{t("dash.period.label")}</span>
      <CalendarDays className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as Period)}
        className="h-9 appearance-none rounded-lg border border-input bg-background pl-8 pr-7 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>{t(`dash.period.${p}`)}</option>
        ))}
      </select>
      <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" fill="currentColor">
        <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
      </svg>
    </label>
  )
}

function SettingsLink() {
  const t = useT()
  const { can } = useAuth()
  if (!can("settings")) return null
  return (
    <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex">
      <Link href="/settings" aria-label={t("dash.nav.settings")} title={t("dash.nav.settings")}>
        <Settings className="h-5 w-5" />
      </Link>
    </Button>
  )
}

function PageSearch() {
  const t = useT()
  const router = useRouter()
  const { can } = useAuth()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const pages = useMemo<PageEntry[]>(() => {
    const items = [...navigation, ...adminNavigation]
      .filter((item) => can(item.module))
      .map((item) => ({ href: item.href, label: t(item.labelKey), icon: item.icon }))
    items.push({ href: "/profile", label: t("nav.profile"), icon: UserCog })
    return items
  }, [can, t])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return pages.filter((p) => p.label.toLowerCase().includes(q))
  }, [pages, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const go = (href: string) => {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false)
      return
    }
    if (!results.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const target = results[Math.min(active, results.length - 1)]
      if (target) go(target.href)
    }
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <div ref={wrapRef} className="relative hidden w-full max-w-xs sm:block lg:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t("topbar.search")}
        aria-label={t("topbar.search")}
        className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">{t("topbar.noResults")}</p>
          ) : (
            <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={r.href} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.href)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
                      i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    )}
                  >
                    <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{r.label}</span>
                    <span className="text-xs text-muted-foreground">{r.href}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const t = useT()
  const { can } = useAuth()
  const canSeeStats = can("dashboard")
  const canValidations = can("validations")
  const canJobs = can("jobs")
  const [stats, setStats] = useState<TopbarStats | null>(null)

  useEffect(() => {
    if (!canSeeStats) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/proxy/stats/", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setStats({
            pending_validations: Number(data.pending_validations ?? 0),
            active_jobs: Number(data.active_jobs ?? 0),
          })
        }
      } catch {
        // notifications are a nice-to-have; a failed poll just keeps the last value
      }
    }
    load()
    const iv = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [canSeeStats])

  const pending = canSeeStats && canValidations ? stats?.pending_validations ?? 0 : 0
  const jobs = canSeeStats && canJobs ? stats?.active_jobs ?? 0 : 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("topbar.notifications")}>
          <Bell className="h-5 w-5" />
          {pending > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-destructive px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white">
              {pending > 99 ? "99+" : pending}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("topbar.notifications")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {pending > 0 && (
          <DropdownMenuItem asChild>
            <Link href="/validations">
              <CheckCircle className="h-4 w-4 text-destructive" />
              <span>{t("topbar.pending", { count: pending })}</span>
            </Link>
          </DropdownMenuItem>
        )}
        {jobs > 0 && (
          <DropdownMenuItem asChild>
            <Link href="/jobs">
              <Briefcase className="h-4 w-4 text-primary" />
              <span>{t("topbar.activeJobs", { count: jobs })}</span>
            </Link>
          </DropdownMenuItem>
        )}
        {pending === 0 && jobs === 0 && (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">{t("topbar.allClear")}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ThemeToggle() {
  const t = useT()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("nav.toggleTheme")}
      title={t("nav.toggleTheme")}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  )
}

function UserMenu() {
  const t = useT()
  const { user, signOut } = useAuth()
  if (!user) return null
  const role = user.roles[0]?.name

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {initials(user.full_name)}
          </span>
          <span className="hidden min-w-0 text-left md:block">
            <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight">{user.full_name}</span>
            {role && (
              <span className="block max-w-[10rem] truncate text-xs leading-tight text-muted-foreground">{role}</span>
            )}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserCog className="h-4 w-4" />
            <span>{t("nav.profile")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut className="h-4 w-4" />
          <span>{t("nav.signOut")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
}
