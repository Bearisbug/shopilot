"use client";

import { RequirePerm } from "@/components/shell/page";
import { ConnectClient } from "./connect-client";

export default function ConnectPage() {
  return <RequirePerm perm="shops.manage">{(me) => <ConnectClient me={me} />}</RequirePerm>;
}
