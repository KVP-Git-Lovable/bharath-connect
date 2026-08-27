import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import WeeklyExecutiveReport from "@/components/reports/WeeklyExecutiveReport";
import ActivityReportGenerator from "@/components/reports/ActivityReport";
import LeadsReportGenerator from "@/components/reports/LeadReport";
import { BarChart3, Activity, TrendingUp } from "lucide-react";

export default function Reports() {
  const [activeTab, setActiveTab] = useState("weekly");

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Generate and view comprehensive business reports</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="weekly" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Weekly</span>
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Leads</span>
            </TabsTrigger>
            <TabsTrigger value="activities" className="gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Activities</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="space-y-4">
            <Card className="border-0 bg-transparent">
              <WeeklyExecutiveReport />
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="space-y-4">
            <Card className="border-0 bg-transparent">
              <LeadsReportGenerator />
            </Card>
          </TabsContent>

          <TabsContent value="activities" className="space-y-4">
            <Card className="border-0 bg-transparent">
              <ActivityReportGenerator />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
