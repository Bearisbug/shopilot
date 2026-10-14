"use client";

import { RequirePerm } from "@/components/shell/page";
import { InvoicesClient } from "./invoices-client";

export default function InvoicesPage() {
  return <RequirePerm perm="orders.use">{(me) => <InvoicesClient me={me} />}</RequirePerm>;
}
