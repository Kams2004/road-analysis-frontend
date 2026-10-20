/**
 * Settings navigation, organised by requirement module → submodule. Every
 * submodule is its own page under /settings/…; the overview (/settings)
 * lists them all. `anchors` are the card ids that used to live on the single
 * /settings page: old deep links (/settings#community) are redirected to the
 * page that now holds that card (see settingsHrefForAnchor).
 */
import type { LucideIcon } from "lucide-react"
import {
  BrainCircuit, Car, CircleDot, Cpu, Hourglass, Layers, Mail, Map as MapIcon, Plug, Route, Shapes, ShieldCheck, Siren,
  Signpost, Smartphone, TrafficCone, Users,
} from "lucide-react"
import type { Tone } from "@/components/stat-card"

export interface SettingsPage {
  id: string
  href: string
  /** i18n keys (lib/i18n/extra/settings-modules.ts). */
  labelKey: string
  descKey: string
  icon: LucideIcon
  tone: Tone
  /** Card ids of the former single settings page now shown here. */
  anchors?: string[]
}

export interface SettingsModule {
  id: string
  labelKey: string
  descKey: string
  pages: SettingsPage[]
}

export const SETTINGS_MODULES: SettingsModule[] = [
  {
    id: "platform", labelKey: "set.mod.platform", descKey: "set.mod.platform.desc",
    pages: [
      { id: "access", href: "/settings/platform", labelKey: "set.page.access", descKey: "set.page.access.desc", icon: ShieldCheck, tone: "green",
        anchors: ["platform", "captcha", "security", "google-signin"] },
      { id: "email", href: "/settings/platform/email", labelKey: "set.page.email", descKey: "set.page.email.desc", icon: Mail, tone: "blue",
        anchors: ["email"] },
      { id: "maps", href: "/settings/platform/maps", labelKey: "set.page.maps", descKey: "set.page.maps.desc", icon: MapIcon, tone: "teal",
        anchors: ["maps"] },
      { id: "general", href: "/settings/platform/general", labelKey: "set.page.general", descKey: "set.page.general.desc", icon: Plug, tone: "slate",
        anchors: ["api", "notifications", "data"] },
    ],
  },
  {
    id: "ai", labelKey: "set.mod.ai", descKey: "set.mod.ai.desc",
    pages: [
      { id: "ai-validation", href: "/settings/ai", labelKey: "set.page.aiValidation", descKey: "set.page.aiValidation.desc", icon: BrainCircuit, tone: "purple",
        anchors: ["model", "ai-validation"] },
      { id: "potholes", href: "/settings/ai/potholes", labelKey: "set.page.potholes", descKey: "set.page.potholes.desc", icon: CircleDot, tone: "red" },
      { id: "traffic-signs", href: "/settings/ai/traffic-signs", labelKey: "set.page.signs", descKey: "set.page.signs.desc", icon: Signpost, tone: "blue" },
      { id: "speed-bumps", href: "/settings/ai/speed-bumps", labelKey: "set.page.bumps", descKey: "set.page.bumps.desc", icon: TrafficCone, tone: "orange" },
      { id: "parked-vehicles", href: "/settings/ai/parked-vehicles", labelKey: "set.page.parked", descKey: "set.page.parked.desc", icon: Car, tone: "teal" },
    ],
  },
  {
    id: "hazards", labelKey: "set.mod.hazards", descKey: "set.mod.hazards.desc",
    pages: [
      { id: "validation", href: "/settings/hazards", labelKey: "set.page.validation", descKey: "set.page.validation.desc", icon: Layers, tone: "orange",
        anchors: ["validation"] },
      // The global Cluster Configuration has its own page (sidebar → Cluster configuration).
      { id: "clustering", href: "/clustering", labelKey: "set.page.clustering", descKey: "set.page.clustering.desc", icon: Shapes, tone: "teal",
        anchors: ["cluster-areas", "cluster-radius", "clustering"] },
      { id: "lifecycle", href: "/settings/hazards/lifecycle", labelKey: "set.page.lifecycle", descKey: "set.page.lifecycle.desc", icon: Hourglass, tone: "red" },
    ],
  },
  {
    id: "jobs", labelKey: "set.mod.jobs", descKey: "set.mod.jobs.desc",
    pages: [
      { id: "processing", href: "/settings/jobs", labelKey: "set.page.processing", descKey: "set.page.processing.desc", icon: Cpu, tone: "blue",
        anchors: ["processing", "cloud"] },
    ],
  },
  {
    id: "community", labelKey: "set.mod.community", descKey: "set.mod.community.desc",
    pages: [
      { id: "community", href: "/settings/community", labelKey: "set.page.community", descKey: "set.page.community.desc", icon: Users, tone: "green",
        anchors: ["community", "community-reports"] },
      { id: "mobile", href: "/settings/community/mobile", labelKey: "set.page.mobile", descKey: "set.page.mobile.desc", icon: Smartphone, tone: "blue",
        anchors: ["mobile"] },
      { id: "collisions", href: "/settings/collisions", labelKey: "set.page.collisions", descKey: "set.page.collisions.desc", icon: Siren, tone: "red",
        anchors: ["collision"] },
      { id: "routes", href: "/settings/routes", labelKey: "set.page.routes", descKey: "set.page.routes.desc", icon: Route, tone: "teal",
        anchors: ["routes"] },
    ],
  },
]

export const SETTINGS_PAGES: SettingsPage[] = SETTINGS_MODULES.flatMap((m) => m.pages)

/** Cards that left Settings for an operational page (old deep links → there). */
export const MOVED_ANCHORS: Record<string, string> = {
  // Drive connections are an input source now (Upload → Cloud sources).
  "cloud-connections": "/cloud-sources",
}

/** Page holding a former /settings#<anchor> card, as "/settings/…#anchor"; null if unknown. */
export function settingsHrefForAnchor(anchor: string): string | null {
  if (MOVED_ANCHORS[anchor]) return MOVED_ANCHORS[anchor]
  const page = SETTINGS_PAGES.find((p) => p.anchors?.includes(anchor))
  if (!page) return null
  return anchor === "platform" ? page.href : `${page.href}#${anchor}`
}

/** Settings page of a detection type (AI detection module). */
export const TYPE_SETTINGS_HREF: Record<string, string> = {
  pothole: "/settings/ai/potholes",
  traffic_sign: "/settings/ai/traffic-signs",
  speed_bump: "/settings/ai/speed-bumps",
  parked_vehicle: "/settings/ai/parked-vehicles",
}
