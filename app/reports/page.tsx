"use client"

import { FileBarChart } from "lucide-react"
import { PlannedModule } from "@/components/dashboard/planned-module"

export default function ReportsPage() {
  return <PlannedModule module="reports" icon={FileBarChart} titleKey="dash.nav.reports" descKey="dash.planned.reports" />
}
