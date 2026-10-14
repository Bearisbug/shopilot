"use client";

import { RequirePerm } from "@/components/shell/page";
import { DataClient } from "./data-client";

export default function Page() {
  return <RequirePerm perm="settings.manage">{(me) => <DataClient me={me} />}</RequirePerm>;
}
