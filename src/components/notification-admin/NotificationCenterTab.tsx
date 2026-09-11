import { BellRing } from "lucide-react";
import TabPlaceholder from "./TabPlaceholder";

export default function NotificationCenterTab() {
  return (
    <TabPlaceholder
      icon={BellRing}
      title="Notification Center"
      description="Create rules that notify the right people automatically when something happens in the app."
      points={[
        "Attendance, leave, regularization, activities and expenses",
        "Leads, opportunities, projects/sites and procurement",
        "Send to the person, their manager chain, a role or a specific user",
        "In-app and push notifications, with a test send",
      ]}
    />
  );
}
