"use client";

import { RequirePerm } from "@/components/shell/page";
import { InvoiceProfileClient } from "./invoice-profile-client";

export default function Page() {
  return <RequirePerm perm="settings.manage">{(me) => <InvoiceProfileClient me={me} />}</RequirePerm>;
}
