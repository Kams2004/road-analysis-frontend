import { Sidebar } from "@/components/sidebar"
import { AnalyticsDashboard } from "@/components/analytics-dashboard"
import { mockDetections } from "@/lib/mock-data"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  Upload,
  Radio,
  AlertTriangle,
  CheckCircle,
} from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const recentDetections = mockDetections.slice(0, 3)
  const pendingCount = mockDetections.filter(
    (d) => d.validationStatus === "pending"
  ).length

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">
              Overview of road risk analysis and detections
            </p>
          </div>

          {/* Quick Actions */}
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/upload">
              <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Upload Video</p>
                    <p className="text-sm text-muted-foreground">
                      Analyze new footage
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/streams">
              <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                    <Radio className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Stream Sources</p>
                    <p className="text-sm text-muted-foreground">
                      Manage live feeds
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/detections">
              <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                    <AlertTriangle className="h-6 w-6 text-warning" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">View Detections</p>
                    <p className="text-sm text-muted-foreground">
                      Browse all hazards
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/validations">
              <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                    <CheckCircle className="h-6 w-6 text-success" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">Validate Zones</p>
                    <p className="text-sm text-muted-foreground">
                      {pendingCount} pending
                    </p>
                  </div>
                  {pendingCount > 0 && (
                    <Badge className="bg-warning text-warning-foreground">
                      {pendingCount}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Analytics */}
          <AnalyticsDashboard />

          {/* Recent Detections */}
          <Card className="mt-8 bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">
                Recent Detections
              </CardTitle>
              <Link href="/detections">
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentDetections.map((detection) => {
                  const severityColors = {
                    low: "bg-info",
                    medium: "bg-warning",
                    high: "bg-chart-3",
                    critical: "bg-destructive",
                  }
                  return (
                    <div
                      key={detection.id}
                      className="flex items-center gap-4 rounded-lg border border-border p-4"
                    >
                      <div
                        className={`h-3 w-3 rounded-full ${
                          severityColors[detection.severity]
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground capitalize">
                          {detection.type.replace("_", " ")}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {detection.location.address}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          detection.validationStatus === "pending"
                            ? "bg-warning/20 text-warning border-warning/30"
                            : detection.validationStatus === "validated"
                            ? "bg-success/20 text-success border-success/30"
                            : "bg-destructive/20 text-destructive border-destructive/30"
                        }
                      >
                        {detection.validationStatus}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
