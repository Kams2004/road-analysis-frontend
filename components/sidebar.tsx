"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Map,
  UploadCloud,
  Radio,
  Cloud,
  ListChecks,
  ScanSearch,
  BadgeCheck,
  MessagesSquare,
  Car,
  Route,
  History,
  Gauge,
  FileBarChart,
  Users,
  KeyRound,
  Plug,
  ScrollText,
  Settings,
  BrainCircuit,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Menu,
  Shapes,
  Database,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BrandLockup } from "@/components/brand"
import { useAuth } from "@/components/auth-provider"
import { useT } from "@/lib/i18n"

type BadgeKey = "active_jobs" | "pending_validations"

export type NavItem = {
  key: string            // stable id (also the legacy nav.* key)
  labelKey: string       // i18n key of the label (lib/i18n/extra/dashboard.ts)
  href: string
  icon: typeof LayoutDashboard
  module: string         // permission module required to see the entry
  badgeKey?: BadgeKey
  sub?: boolean          // rendered as an indented sub-entry of the item above
}

// Each entry is shown only when the user can view its module (RRAP-01-007).
export const navigation: NavItem[] = [
  { key: "dashboard", labelKey: "dash.nav.dashboard", href: "/", icon: LayoutDashboard, module: "dashboard" },
  { key: "map", labelKey: "dash.nav.map", href: "/map", icon: Map, module: "map" },
  { key: "upload", labelKey: "dash.nav.upload", href: "/upload", icon: UploadCloud, module: "jobs" },
  { key: "streams", labelKey: "dash.nav.streams", href: "/streams", icon: Radio, module: "streams", sub: true },
  { key: "cloudSources", labelKey: "dash.nav.cloudSources", href: "/cloud-sources", icon: Cloud, module: "jobs", sub: true },
  { key: "jobs", labelKey: "dash.nav.jobs", href: "/jobs", icon: ListChecks, module: "jobs", badgeKey: "active_jobs" },
  { key: "detections", labelKey: "dash.nav.detections", href: "/detections", icon: ScanSearch, module: "detections" },
  // Global Cluster Configuration (Module 6) — part of the platform settings.
  { key: "clustering", labelKey: "cl.nav", href: "/clustering", icon: Shapes, module: "settings", sub: true },
  { key: "validations", labelKey: "dash.nav.validations", href: "/validations", icon: BadgeCheck, module: "validations", badgeKey: "pending_validations" },
  { key: "trainingData", labelKey: "td.nav", href: "/training-data", icon: Database, module: "datasets", sub: true },
  { key: "signalements", labelKey: "dash.nav.signalements", href: "/signalements", icon: MessagesSquare, module: "signalements" },
  { key: "collisions", labelKey: "dash.nav.collisions", href: "/collisions", icon: Car, module: "collisions" },
  { key: "roadRisk", labelKey: "dash.nav.roadRisk", href: "/road-risk", icon: Route, module: "road_risk" },
  { key: "historical", labelKey: "dash.nav.historical", href: "/historical", icon: History, module: "historical" },
  { key: "driverBehaviour", labelKey: "dash.nav.driverBehaviour", href: "/driver-behaviour", icon: Gauge, module: "driver_behaviour" },
  { key: "reports", labelKey: "dash.nav.reports", href: "/reports", icon: FileBarChart, module: "reports" },
]

export const adminNavigation: NavItem[] = [
  { key: "users", labelKey: "dash.nav.users", href: "/admin/users", icon: Users, module: "users" },
  { key: "roles", labelKey: "dash.nav.roles", href: "/admin/roles", icon: KeyRound, module: "roles" },
  { key: "apiClients", labelKey: "dash.nav.apiClients", href: "/admin/api-clients", icon: Plug, module: "api_clients" },
  { key: "audit", labelKey: "dash.nav.audit", href: "/admin/audit", icon: ScrollText, module: "audit" },
  { key: "aiModels", labelKey: "dash.nav.aiModels", href: "/admin/models", icon: BrainCircuit, module: "settings" },
  { key: "settings", labelKey: "dash.nav.settings", href: "/settings", icon: Settings, module: "settings" },
]

const isActiveHref = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)

interface SidebarStats {
  active_jobs: number
  pending_validations: number
}

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [stats, setStats] = useState<SidebarStats | null>(null)
  const { user, can } = useAuth()
  const t = useT()
  const visibleNav = navigation.filter((item) => can(item.module))
  const visibleAdmin = adminNavigation.filter((item) => can(item.module))
  const adminActive = visibleAdmin.some((item) => isActiveHref(pathname, item.href))
  const [adminOpen, setAdminOpen] = useState(adminActive)
  const canSeeStats = can("dashboard")

  useEffect(() => {
    if (adminActive) setAdminOpen(true)
  }, [adminActive])

  // Same /stats endpoint the dashboard uses — just the two counts this rail
  // needs. A failed fetch simply leaves the badges off, nothing more.
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
            active_jobs: data.active_jobs ?? 0,
            pending_validations: data.pending_validations ?? 0,
          })
        }
      } catch {
        // sidebar badges are a nice-to-have, not load-bearing
      }
    }
    load()
    const iv = setInterval(load, 20_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [canSeeStats])

  function renderItem(item: NavItem) {
    const isActive = isActiveHref(pathname, item.href)
    const badgeValue = item.badgeKey ? stats?.[item.badgeKey] : undefined
    // Red = needs review/action (pending validations); blue = purely
    // informational (jobs currently running) — never decorative.
    const isDanger = item.badgeKey === "pending_validations"
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
          item.sub ? "ml-5 px-3 py-1.5 text-[13px]" : "px-3 py-2",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <item.icon className={cn("shrink-0", item.sub ? "h-4 w-4" : "h-[18px] w-[18px]")} strokeWidth={1.75} />
        <span className="flex-1 truncate">{t(item.labelKey)}</span>
        {!!badgeValue && (
          <span
            className={cn(
              "min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none",
              isDanger
                ? "bg-sidebar-danger text-white"
                : isActive
                  ? "bg-white/25 text-white"
                  : "bg-sidebar-primary text-sidebar-primary-foreground"
            )}
          >
            {badgeValue > 99 ? "99+" : badgeValue}
          </span>
        )}
      </Link>
    )
  }

  return (
    <>
      {/* Mobile menu button */}
      <div className="fixed top-3.5 left-4 z-50 lg:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="h-9 w-9 bg-sidebar border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — always the brand navy (see --sidebar* in globals.css),
          independent of the light/dark toggle, which only affects the
          content area to the right of it. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-sidebar-border px-5">
            <BrandLockup tagline={t("auth.subtitle")} inverted />
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
            {visibleNav.map(renderItem)}
            {visibleAdmin.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setAdminOpen((o) => !o)}
                  aria-expanded={adminOpen}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    adminActive && !adminOpen
                      ? "text-sidebar-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <ShieldCheck className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                  <span className="flex-1 text-left">{t("dash.nav.administration")}</span>
                  {adminOpen ? <ChevronDown className="h-4 w-4 opacity-60" /> : <ChevronRight className="h-4 w-4 opacity-60" />}
                </button>
                {adminOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {visibleAdmin.map((item) => renderItem({ ...item, sub: true }))}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Footer — signed-in user (language & sign-out live in the top bar) */}
          {user && (
            <div className="border-t border-sidebar-border p-3">
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                title={t("nav.profile")}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-sidebar-accent/60",
                  pathname === "/profile" && "bg-sidebar-accent"
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                  {initials(user.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-sidebar-foreground">{user.full_name}</p>
                  <p className="truncate text-[11px] text-sidebar-foreground/60">
                    {user.roles.map((r) => r.name).join(", ") || user.email}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
}
