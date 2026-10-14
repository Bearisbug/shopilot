"use client";

import { RequirePerm } from "@/components/shell/page";
import { AuditClient } from "./audit-client";

export default function Page() {
  return <RequirePerm perm="settings.manage">{(me) => <AuditClient me={me} />}</RequirePerm>;
}
