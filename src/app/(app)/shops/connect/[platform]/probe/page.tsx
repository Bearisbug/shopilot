"use client";

import { RequirePerm } from "@/components/shell/page";
import { NotAPlatform, usePlatformParam } from "../../connect-ui";
import { ProbeClient } from "./probe-client";

export default function ProbePage() {
  const platform = usePlatformParam();
  if (!platform) return <NotAPlatform />;
  return <RequirePerm perm="shops.manage">{(me) => <ProbeClient me={me} platform={platform} />}</RequirePerm>;
}
