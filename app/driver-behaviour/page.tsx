"use client"

import { Gauge } from "lucide-react"
import { PlannedModule } from "@/components/dashboard/planned-module"

export default function DriverBehaviourPage() {
  return <PlannedModule module="driver_behaviour" icon={Gauge} titleKey="dash.nav.driverBehaviour" descKey="dash.planned.driverBehaviour" />
}
