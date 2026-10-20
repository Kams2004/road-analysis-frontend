"use client"

/**
 * Loads the signed-in user (GET /auth/me) once per page load and exposes it,
 * plus `can(module, action)`, to the whole console. It also applies the
 * user's language, records screen views for the audit trail and sends the
 * visitor to /login when the session is gone.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ApiError, getMe, logActivity, logout as apiLogout, type Action, type Me } from "@/lib/auth-api"
import { useI18n, type Lang } from "@/lib/i18n"

const PUBLIC_PAGES = ["/login", "/forgot-password", "/reset-password"]

interface AuthCtx {
  user: Me | null
  loading: boolean
  can: (module: string, action?: Action) => boolean
  refresh: () => Promise<void>
  setUser: (user: Me) => void
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { setLang } = useI18n()
  const [user, setUserState] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const isPublic = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  const setUser = useCallback((u: Me) => {
    setUserState(u)
    setLang(u.language as Lang)
  }, [setLang])

  const refresh = useCallback(async () => {
    try {
      setUser(await getMe())
    } catch (e) {
      setUserState(null)
      if (e instanceof ApiError && e.status === 401) {
        const next = window.location.pathname + window.location.search
        router.replace(next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login")
      }
    } finally {
      setLoading(false)
    }
  }, [router, setUser])

  useEffect(() => {
    if (isPublic) { setLoading(false); return }
    if (!user) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublic])

  // Screen-view trail (RRAP-13-006).
  useEffect(() => {
    if (user && !isPublic) logActivity(pathname)
  }, [pathname, user?.id, isPublic]) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    try { await apiLogout() } finally {
      setUserState(null)
      window.location.href = "/login"
    }
  }, [])

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    can: (module, action = "view") => !!user?.permissions?.[module]?.includes(action),
    refresh,
    setUser,
    signOut,
  }), [user, loading, refresh, setUser, signOut])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
