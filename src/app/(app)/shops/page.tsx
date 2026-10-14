"use client";

import { RequirePerm } from "@/components/shell/page";
import { ShopsClient } from "./shops-client";

export default function ShopsPage() {
  return <RequirePerm perm="shops.manage">{(me) => <ShopsClient me={me} />}</RequirePerm>;
}
