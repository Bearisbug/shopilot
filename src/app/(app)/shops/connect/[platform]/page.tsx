"use client";

import { RequirePerm } from "@/components/shell/page";
import { NotAPlatform, usePlatformParam } from "../connect-ui";
import { CredentialsClient } from "./credentials-client";

export default function CredentialsPage() {
  const platform = usePlatformParam();
  if (!platform) return <NotAPlatform />;
  return <RequirePerm perm="shops.manage">{() => <CredentialsClient platform={platform} />}</RequirePerm>;
}
