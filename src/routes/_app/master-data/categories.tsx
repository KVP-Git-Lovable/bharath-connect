import { createFileRoute } from "@tanstack/react-router";
import CategoryMaster from "@/pages/master/CategoryMaster";

export const Route = createFileRoute("/_app/master-data/categories")({
  component: CategoryMaster,
});
