"use client"

/**
 * Pointer card left where the scattered radius cards used to be (Settings →
 * Hazards): the clustering radius lives in ONE place, /clustering.
 */
import Link from "next/link"
import { ArrowRight, Shapes } from "lucide-react"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"

export function ClusterConfigLinkCard() {
  const t = useT()
  return (
    <SectionCard id="cluster-radius" icon={Shapes} tone="teal" title={t("cl.link.title")} description={t("cl.link.desc")}>
      <div id="cluster-areas" className="flex justify-end">
        <Button asChild size="sm">
          <Link href="/clustering">{t("cl.link.open")}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </div>
    </SectionCard>
  )
}
