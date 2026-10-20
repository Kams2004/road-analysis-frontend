"use client"

/**
 * Online CAPTCHA widget (RRAP-01-003, 01-006). Supports Cloudflare Turnstile,
 * Google reCAPTCHA v2 and hCaptcha — whichever the administrator configured
 * in Settings → Platform. All three expose the same explicit-render API:
 * render(el, { sitekey, callback, ... }) and reset(widgetId).
 *
 * The parent gets the token through onToken (null when it expires/resets) and
 * can force a fresh challenge with the imperative `reset()` handle — used
 * after a failed sign-in and by the "new security check" button.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"

type Provider = "turnstile" | "recaptcha" | "hcaptcha"

interface WidgetApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string | number
  reset: (id?: string | number) => void
  remove?: (id: string | number) => void
}

const SCRIPTS: Record<Provider, { src: string; global: string }> = {
  turnstile: { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", global: "turnstile" },
  recaptcha: { src: "https://www.google.com/recaptcha/api.js?render=explicit", global: "grecaptcha" },
  hcaptcha:  { src: "https://js.hcaptcha.com/1/api.js?render=explicit", global: "hcaptcha" },
}

const loaders: Partial<Record<Provider, Promise<WidgetApi>>> = {}

function loadProvider(provider: Provider): Promise<WidgetApi> {
  if (loaders[provider]) return loaders[provider]!
  const { src, global } = SCRIPTS[provider]
  loaders[provider] = new Promise<WidgetApi>((resolve, reject) => {
    const w = window as unknown as Record<string, WidgetApi & { ready?: (cb: () => void) => void }>
    const done = () => {
      const api = w[global]
      if (provider === "recaptcha" && api?.ready) api.ready(() => resolve(api))
      else resolve(api)
    }
    if (typeof w[global]?.render === "function") return done()
    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => {
      // reCAPTCHA defines its global before render() is usable; poll briefly.
      const started = Date.now()
      const wait = () => (typeof w[global]?.render === "function" ? done() : Date.now() - started > 10_000 ? reject(new Error("captcha load timeout")) : setTimeout(wait, 50))
      wait()
    }
    script.onerror = () => { delete loaders[provider]; reject(new Error("captcha script failed to load")) }
    document.head.appendChild(script)
  })
  return loaders[provider]!
}

export interface CaptchaHandle { reset: () => void }

export const CaptchaWidget = forwardRef<CaptchaHandle, {
  provider: Provider | "disabled"
  siteKey: string
  onToken: (token: string | null) => void
  theme?: "light" | "dark" | "auto"
  lang?: string
}>(function CaptchaWidget({ provider, siteKey, onToken, theme = "auto", lang }, ref) {
  const t = useT()
  const container = useRef<HTMLDivElement>(null)
  const api = useRef<WidgetApi | null>(null)
  const widgetId = useRef<string | number | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  const reset = useCallback(() => {
    onToken(null)
    if (api.current && widgetId.current !== null) api.current.reset(widgetId.current)
  }, [onToken])

  useImperativeHandle(ref, () => ({ reset }), [reset])

  useEffect(() => {
    if (provider === "disabled" || !siteKey) return
    let cancelled = false
    setState("loading")
    loadProvider(provider)
      .then((loaded) => {
        if (cancelled || !container.current) return
        api.current = loaded
        container.current.innerHTML = ""
        const target = document.createElement("div")
        container.current.appendChild(target)
        widgetId.current = loaded.render(target, {
          sitekey: siteKey,
          theme: provider === "turnstile" ? theme : theme === "dark" ? "dark" : "light",
          ...(provider === "turnstile" && lang ? { language: lang } : {}),
          ...(provider === "hcaptcha" && lang ? { hl: lang } : {}),
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        })
        setState("ready")
      })
      .catch(() => !cancelled && setState("error"))
    return () => {
      cancelled = true
      if (api.current?.remove && widgetId.current !== null) {
        try { api.current.remove(widgetId.current) } catch { /* already gone */ }
      }
      widgetId.current = null
    }
  }, [provider, siteKey, theme, lang, onToken])

  if (provider === "disabled") return null

  return (
    <div className="space-y-2">
      <div ref={container} className="min-h-[65px]" />
      {state === "loading" && <p className="text-xs text-muted-foreground">{t("auth.captchaLoading")}</p>}
      {state === "error" && <p className="text-xs text-destructive">{t("auth.err.captcha_unavailable")}</p>}
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={reset}>
        <RefreshCw className="mr-1 h-3 w-3" />
        {t("auth.captchaRefresh")}
      </Button>
    </div>
  )
})
