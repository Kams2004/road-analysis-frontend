"use client"

import { AuthHero } from "@/components/auth-hero"
import { BrandLockup } from "@/components/brand"
import { LanguageSelect } from "@/components/language-select"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

/**
 * Sign-in layout. `split` (the main sign-in form) puts the illustrated hero
 * panel next to the form; otherwise a single card with the logo on top.
 */
export function AuthShell({
  title,
  subtitle,
  split = false,
  children,
}: {
  title: string
  subtitle?: string
  split?: boolean
  children: React.ReactNode
}) {
  const t = useT()

  if (split) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4 sm:p-8">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl lg:min-h-[600px] lg:grid-cols-[1.1fr_1fr]">
          <AuthHero />
          <div className="flex flex-col p-6 sm:p-10">
            <div className="flex items-center justify-between lg:justify-end">
              <BrandLockup tagline={t("auth.subtitle")} className="lg:hidden" />
              <LanguageSelect compact className="w-[110px]" />
            </div>
            <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
              <Heading title={title} subtitle={subtitle} />
              {children}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4 sm:p-8">
      <div className={cn("w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-10")}>
        <div className="mb-8 flex items-center justify-between">
          <BrandLockup tagline={t("auth.subtitle")} />
          <LanguageSelect compact className="w-[110px]" />
        </div>
        <Heading title={title} subtitle={subtitle} />
        {children}
      </div>
    </div>
  )
}

/** "← Back to sign in" link/button used under the auth forms. */
export function BackToSignIn({ onClick }: { onClick?: () => void }) {
  const t = useT()
  const cls = "mx-auto mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>← {t("auth.backToLogin")}</button>
  ) : (
    <a href="/login" className={cls}>← {t("auth.backToLogin")}</a>
  )
}
