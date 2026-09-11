import { FileBarChart } from "lucide-react";
import TabPlaceholder from "./TabPlaceholder";

export default function ReportSubscriptionsTab() {
  return (
    <TabPlaceholder
      icon={FileBarChart}
      title="Report Subscriptions"
      description="Schedule any saved report and deliver it in-app with an optional push notification."
      points={[
        "Daily, weekday, weekly or monthly schedules",
        "Attendance, activity, leave, expense, lead, opportunity, milestone and procurement reports",
        "Choose recipients; managers only see their own team's data",
        "PDF delivered to the notification inbox",
      ]}
    />
  );
}
