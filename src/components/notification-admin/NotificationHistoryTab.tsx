import { History } from "lucide-react";
import TabPlaceholder from "./TabPlaceholder";

export default function NotificationHistoryTab() {
  return (
    <TabPlaceholder
      icon={History}
      title="Notification History"
      description="See every notification and report that was sent, to whom, and whether it was read."
      points={[
        "Filter by type, user, module and date",
        "Read / unread and push delivery status",
        "Report delivery history with the file that was sent",
      ]}
    />
  );
}
