import { createFileRoute } from "@tanstack/react-router";
import PendingApprovals from "@/pages/PendingApprovals";

export const Route = createFileRoute("/_app/pending-approvals")({
  component: PendingApprovals,
});
