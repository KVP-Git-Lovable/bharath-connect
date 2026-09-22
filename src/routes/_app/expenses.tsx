import { createFileRoute } from "@tanstack/react-router";
import Expenses from "@/pages/Expenses";

export const Route = createFileRoute("/_app/expenses")({
  component: Expenses,
});
