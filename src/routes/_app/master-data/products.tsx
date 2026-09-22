import { createFileRoute } from "@tanstack/react-router";
import ProductMaster from "@/pages/master/ProductMaster";

export const Route = createFileRoute("/_app/master-data/products")({
  component: ProductMaster,
});
