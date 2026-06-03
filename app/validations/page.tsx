import { Sidebar } from "@/components/sidebar"
import { DetectionTable } from "@/components/detection-table"
import { Card, CardContent } from "@/components/ui/card"
import { Clock, CheckCircle, XCircle } from "lucide-react"
import { mockDetections } from "@/lib/mock-data"

export default function ValidationsPage() {
  const pendingCount = mockDetections.filter(
    (d) => d.validationStatus === "pending"
  ).length
  const validatedCount = mockDetections.filter(
    (d) => d.validationStatus === "validated"
  ).length
  const rejectedCount = mockDetections.filter(
    (d) => d.validationStatus === "rejected"
  ).length

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Validate Risk Zones</h1>
            <p className="mt-1 text-muted-foreground">
              Review AI detections and confirm valid road hazards
            </p>
          </div>

          {/* Stats */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <Card className="bg-card border-border">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                  <Clock className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{validatedCount}</p>
                  <p className="text-sm text-muted-foreground">Validated</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
                  <XCircle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{rejectedCount}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pending Detections for Validation */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground">
                Pending Validations
              </h2>
              <p className="text-sm text-muted-foreground">
                Review each detection and mark as a valid risk zone or reject false
                positives
              </p>
            </div>
            <DetectionTable 
              showValidationActions 
              filterStatus="pending" 
              pageSize={10}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
