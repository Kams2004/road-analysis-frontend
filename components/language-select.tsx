"use client"

import { Globe } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LANGS, useI18n, type Lang } from "@/lib/i18n"
import { useAuth } from "@/components/auth-provider"
import { updateMe } from "@/lib/auth-api"
import { cn } from "@/lib/utils"

/**
 * EN / FR / ES switcher. When signed in the choice is saved to the user's
 * profile so it follows them to any browser; otherwise it is remembered
 * locally for the sign-in pages.
 */
export function LanguageSelect({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { lang, setLang, t } = useI18n()
  const { user, setUser } = useAuth()

  const change = async (value: string) => {
    const next = value as Lang
    setLang(next)
    if (user && user.language !== next) {
      try { setUser(await updateMe({ language: next })) } catch { /* keep local choice */ }
    }
  }

  return (
    <Select value={lang} onValueChange={change}>
      <SelectTrigger className={cn(compact ? "h-8 w-[130px] text-xs" : "w-full", className)} aria-label={t("nav.language")}>
        <Globe className="mr-1 h-3.5 w-3.5 opacity-60" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGS.map((l) => (
          <SelectItem key={l} value={l}>{t(`lang.${l}`)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
