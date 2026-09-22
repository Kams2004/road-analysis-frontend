"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboard,
  Upload,
  Radio,
  AlertTriangle,
  CheckCircle,
  Settings,
  Menu,
  X,
  Shield,
  Sun,
  Moon,
  Briefcase,
  Map,
  Navigation,
  MessageSquareWarning,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type BadgeKey = "active_jobs" | "pending_validations"

const navigation: { name: string; href: string; icon: typeof LayoutDashboard; badgeKey?: BadgeKey }[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Upload Videos", href: "/upload", icon: Upload },
  { name: "Stream Sources", href: "/streams", icon: Radio },
  { name: "Jobs", href: "/jobs", icon: Briefcase, badgeKey: "active_jobs" },
  { name: "Detections", href: "/detections", icon: AlertTriangle },
  { name: "Validations", href: "/validations", icon: CheckCircle, badgeKey: "pending_validations" },
  { name: "Map", href: "/map", icon: Map },
  { name: "Navigate", href: "/navigate", icon: Navigation },
  { name: "Signalements", href: "/signalements", icon: MessageSquareWarning },
  { name: "Settings", href: "/settings", icon: Settings },
]

interface SidebarStats {
  active_jobs: number
  pending_validations: number
}

export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const [stats, setStats] = useState<SidebarStats | null>(null)

  // Same /stats endpoint the dashboard uses — just the two counts this rail
  // needs. A failed fetch simply leaves the badges off, nothing more.
  useEffect(() => {
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
  }, [])

  return (
    <>
      {/* Mobile menu button */}
      <div className="fixed top-4 left-4 z-50 lg:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="bg-sidebar border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
                <Shield className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-sidebar-foreground">
                  VIASafe
                </h1>
                <p className="text-xs text-sidebar-foreground/60">Admin Console</p>
              </div>
            </div>
            {/* Theme Toggle — affects the content area only */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const badgeValue = item.badgeKey ? stats?.[item.badgeKey] : undefined
              // Red = needs review/action (pending validations); blue = purely
              // informational (jobs currently running) — never decorative.
              const isDanger = item.badgeKey === "pending_validations"
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground"
                      : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{item.name}</span>
                  {!!badgeValue && (
                    <span
                      className={cn(
                        "min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none",
                        isDanger
                          ? "bg-sidebar-danger text-white"
                          : "bg-sidebar-primary text-sidebar-primary-foreground"
                      )}
                    >
                      {badgeValue > 99 ? "99+" : badgeValue}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-sidebar-foreground/60">Platform online</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
