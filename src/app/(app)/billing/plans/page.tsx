"use client";

import { RequirePerm } from "@/components/shell/page";
import { PlansClient } from "./plans-client";

export default function BillingPlansPage() {
  return <RequirePerm perm="billing.manage">{(me) => <PlansClient me={me} />}</RequirePerm>;
}
