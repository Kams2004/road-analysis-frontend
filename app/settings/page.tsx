import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import {
  Settings as SettingsIcon,
  Bell,
  Shield,
  Database,
  Cpu,
  Globe,
} from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="mt-1 text-muted-foreground">
              Configure your road analysis platform preferences
            </p>
          </div>

          <div className="space-y-6">
            {/* Model Configuration */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Model Configuration</CardTitle>
                </div>
                <CardDescription>
                  Configure AI model settings and detection thresholds
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Detection Model</Label>
                    <Select defaultValue="yolov8">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yolov8">YOLOv8 (Recommended)</SelectItem>
                        <SelectItem value="yolov5">YOLOv5</SelectItem>
                        <SelectItem value="custom">Custom Model</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Processing Quality</Label>
                    <Select defaultValue="balanced">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fast">Fast (Lower Accuracy)</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="accurate">Accurate (Slower)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Confidence Threshold</Label>
                      <span className="text-sm text-muted-foreground">75%</span>
                    </div>
                    <Slider defaultValue={[75]} max={100} step={5} />
                    <p className="text-xs text-muted-foreground">
                      Only show detections with confidence above this threshold
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-foreground">Detection Types</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      "Potholes",
                      "Traffic Signs",
                      "Speed Bumps",
                      "Speed Humps",
                      "Road Cracks",
                      "Debris",
                      "Road Damage",
                      "Missing Signs",
                    ].map((type) => (
                      <div key={type} className="flex items-center justify-between">
                        <Label className="text-sm font-normal">{type}</Label>
                        <Switch defaultChecked />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* API Configuration */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">API Configuration</CardTitle>
                </div>
                <CardDescription>
                  Configure API endpoints and authentication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Model API Endpoint</Label>
                  <Input placeholder="https://api.example.com/v1/detect" />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input type="password" placeholder="sk-..." />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      Enable Webhook Notifications
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Send detection results to external services
                    </p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>

            {/* Notifications */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Notifications</CardTitle>
                </div>
                <CardDescription>
                  Configure how you want to be notified about detections
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    title: "Critical Detections",
                    description: "Get notified for critical severity hazards",
                    defaultChecked: true,
                  },
                  {
                    title: "Processing Complete",
                    description: "Notify when video processing is finished",
                    defaultChecked: true,
                  },
                  {
                    title: "Stream Errors",
                    description: "Alert when a stream source disconnects",
                    defaultChecked: true,
                  },
                  {
                    title: "Weekly Reports",
                    description: "Receive weekly summary reports",
                    defaultChecked: false,
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-center justify-between rounded-lg border border-border p-4"
                  >
                    <div>
                      <p className="font-medium text-foreground text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <Switch defaultChecked={item.defaultChecked} />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Data Management */}
            <Card className="bg-card border-border">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Data Management</CardTitle>
                </div>
                <CardDescription>
                  Manage detection data and storage settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Data Retention Period</Label>
                  <Select defaultValue="90">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                      <SelectItem value="forever">Forever</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      Auto-delete Rejected Detections
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Automatically remove rejected detections after 7 days
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground text-sm">Export Data</p>
                      <p className="text-xs text-muted-foreground">
                        Download all detections as CSV or JSON
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Export
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button>Save Settings</Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
