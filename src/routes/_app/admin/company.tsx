import { createFileRoute } from "@tanstack/react-router";
import CompanyProfile from "@/pages/CompanyProfile";

export const Route = createFileRoute("/_app/admin/company")({
  component: CompanyProfile,
});
