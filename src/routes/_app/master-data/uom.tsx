import { createFileRoute } from "@tanstack/react-router";
import UomMaster from "@/pages/master/UomMaster";

export const Route = createFileRoute("/_app/master-data/uom")({
  component: UomMaster,
});
