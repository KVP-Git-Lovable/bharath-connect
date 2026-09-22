import { createFileRoute } from "@tanstack/react-router";
import CurrencyMaster from "@/pages/master/CurrencyMaster";

export const Route = createFileRoute("/_app/master-data/currencies")({
  component: CurrencyMaster,
});
