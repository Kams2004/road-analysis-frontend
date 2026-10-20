"use client"

import { BrandLockup } from "@/components/brand"
import { useT } from "@/lib/i18n"

const HERO_SRC = encodeURI("/Tropical Highway to the Coast.png")

/**
 * Left-hand panel of the sign-in page: the coastal highway photo with the
 * product promise over it.
 */
export function AuthHero() {
  const t = useT()
  return (
    <div className="relative hidden overflow-hidden bg-[#0b1d3a] lg:block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={HERO_SRC}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[58%_center]"
      />
      {/* Darken top (logo) and bottom (headline) so the white text stays readable. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b1d3a]/70 via-transparent to-[#0b1d3a]/90" />
      <div className="relative flex h-full flex-col justify-between p-10">
        <BrandLockup tagline={t("auth.subtitle")} inverted />
        <div className="max-w-sm">
          <h2 className="text-4xl font-bold leading-tight text-white">{t("auth.heroTitle")}</h2>
          <p className="mt-4 text-base text-white/80">{t("auth.heroText")}</p>
        </div>
      </div>
    </div>
  )
}
