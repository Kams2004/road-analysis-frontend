"use client"

import { ShieldAlert, Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useT } from "@/lib/i18n"
import type { Action } from "@/lib/auth-api"

/**
 * Renders children only when the signed-in user holds `module:action`.
 * Pages wrap their content in it so a typed URL shows a clear message rather
 * than a half-broken screen of 403s. The backend enforces the same rule.
 */
export function RequirePermission({
  module,
  action = "view",
  children,
}: {
  module: string
  action?: Action
  children: React.ReactNode
}) {
  const { user, loading, can } = useAuth()
  const t = useT()

  if (loading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (!can(module, action)) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-sm">{t("common.noPermission")}</p>
      </div>
    )
  }
  return <>{children}</>
}
