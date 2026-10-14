"use client";

import { RequirePerm } from "@/components/shell/page";
import { NotAPlatform, usePlatformParam } from "../../connect-ui";
import { GuideClient } from "./guide-client";

export default function GuidePage() {
  const platform = usePlatformParam();
  if (!platform) return <NotAPlatform />;
  return <RequirePerm perm="shops.manage">{(me) => <GuideClient me={me} platform={platform} />}</RequirePerm>;
}
