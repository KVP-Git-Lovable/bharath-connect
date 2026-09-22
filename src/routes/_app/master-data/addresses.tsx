import { createFileRoute } from "@tanstack/react-router";
import AddressBook from "@/pages/master/AddressBook";

export const Route = createFileRoute("/_app/master-data/addresses")({
  component: AddressBook,
});
