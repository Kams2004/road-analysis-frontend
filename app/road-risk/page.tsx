"use client"

import { Route } from "lucide-react"
import { PlannedModule } from "@/components/dashboard/planned-module"

export default function RoadRiskPage() {
  return <PlannedModule module="road_risk" icon={Route} titleKey="dash.nav.roadRisk" descKey="dash.planned.roadRisk" />
}
