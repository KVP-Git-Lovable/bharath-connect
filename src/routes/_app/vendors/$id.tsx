import { createFileRoute } from "@tanstack/react-router";
import VendorDetail from "@/pages/VendorDetail";

export const Route = createFileRoute("/_app/vendors/$id")({
  component: VendorDetail,
});
