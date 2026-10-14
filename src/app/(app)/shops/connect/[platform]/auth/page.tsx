"use client";

import { RequirePerm } from "@/components/shell/page";
import { NotAPlatform, usePlatformParam } from "../../connect-ui";
import { AuthClient } from "./auth-client";

export default function AuthPage() {
  const platform = usePlatformParam();
  if (!platform) return <NotAPlatform />;
  return <RequirePerm perm="shops.manage">{(me) => <AuthClient me={me} platform={platform} />}</RequirePerm>;
}
