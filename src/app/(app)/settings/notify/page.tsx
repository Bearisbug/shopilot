"use client";

import { RequirePerm } from "@/components/shell/page";
import { NotifyClient } from "./notify-client";

export default function Page() {
  return <RequirePerm perm="settings.manage">{(me) => <NotifyClient me={me} />}</RequirePerm>;
}
