"use client";

import { RequirePerm } from "@/components/shell/page";
import { SecurityClient } from "./security-client";

export default function Page() {
  return <RequirePerm perm="settings.manage">{(me) => <SecurityClient me={me} />}</RequirePerm>;
}
