"use client"

/**
 * Minimal i18n for the console (RRAP-01-005): English, French, Spanish.
 *
 * The active language comes from the signed-in user's profile (set by
 * AuthProvider); before sign-in it is the last language chosen on this
 * browser, else the browser language. Missing keys fall back to English.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import en, { type MessageKey } from "./en"
import fr from "./fr"
import es from "./es"
// Per-area dictionaries, kept in separate files so screens can be translated
// independently. They are merged over the core dictionaries below.
import * as admin from "./extra/admin"
import * as account from "./extra/account"
import * as pagesOps from "./extra/pages-ops"
import * as pagesMap from "./extra/pages-map"
import * as module6 from "./extra/module6"
import * as module7 from "./extra/module7"
import * as dashboard from "./extra/dashboard"
import * as community from "./extra/community"
import * as historical from "./extra/historical"
import * as routes from "./extra/routes"
import * as ai from "./extra/ai"
import * as trafficSigns from "./extra/traffic-signs"
import * as parkedVehicle from "./extra/parked-vehicle"
import * as hazardLifecycle from "./extra/hazard-lifecycle"
import * as settingsModules from "./extra/settings-modules"
import * as hazardTrack from "./extra/hazard-track"
import * as clustering from "./extra/clustering"
import * as cloudSources from "./extra/cloud-sources"
import * as trainingData from "./extra/training-data"
import * as rejectionReasons from "./extra/rejection-reasons"
import * as clusters from "./extra/clusters"
import * as exceptionPatterns from "./extra/exception-patterns"
import * as reports from "./extra/reports"

export { signLabel, humanizeSign, subtypeText } from "./extra/traffic-signs"

export type Lang = "en" | "fr" | "es"
export const LANGS: Lang[] = ["en", "fr", "es"]

const EXTRA = [admin, account, pagesOps, pagesMap, module6, module7, dashboard, community, historical, routes, ai, trafficSigns, parkedVehicle, hazardLifecycle, settingsModules, hazardTrack, clustering, cloudSources, trainingData, rejectionReasons, clusters, exceptionPatterns, reports]
const merge = (lang: Lang, core: Record<string, string>) =>
  Object.assign({}, core, ...EXTRA.map((m) => m[lang]))

const DICTS: Record<Lang, Record<string, string>> = {
  en: merge("en", en),
  fr: merge("fr", fr),
  es: merge("es", es),
}
const STORAGE_KEY = "rr_lang"

type Vars = Record<string, string | number>

export function translate(lang: Lang, key: MessageKey | string, vars?: Vars): string {
  let text = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
  }
  return text
}

interface I18nCtx {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: MessageKey | string, vars?: Vars) => string
  /** Locale for dates/numbers (toLocaleString etc.). */
  locale: string
}

const Ctx = createContext<I18nCtx | null>(null)

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null
    if (stored && LANGS.includes(stored)) return stored
  } catch { /* storage unavailable */ }
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en"
  return (LANGS as string[]).includes(nav) ? (nav as Lang) : "en"
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en")

  useEffect(() => { setLangState(initialLang()) }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }, [])

  const value = useMemo<I18nCtx>(() => ({
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    locale: lang === "fr" ? "fr-FR" : lang === "es" ? "es-ES" : "en-GB",
  }), [lang, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>")
  return ctx
}

/** Shorthand: const t = useT(); t("nav.dashboard") */
export function useT() {
  return useI18n().t
}
