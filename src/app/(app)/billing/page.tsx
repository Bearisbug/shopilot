"use client";

import { RequirePerm } from "@/components/shell/page";
import { BillingClient } from "./billing-client";

export default function BillingPage() {
  return <RequirePerm perm="billing.manage">{(me) => <BillingClient me={me} />}</RequirePerm>;
}
