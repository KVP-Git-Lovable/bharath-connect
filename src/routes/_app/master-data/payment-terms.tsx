import { createFileRoute } from "@tanstack/react-router";
import PaymentTermsMaster from "@/pages/master/PaymentTermsMaster";

export const Route = createFileRoute("/_app/master-data/payment-terms")({
  component: PaymentTermsMaster,
});
