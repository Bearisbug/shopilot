"use client";

import { ErrorState, LoadingRows } from "@/components/shell/page";
import { useMe } from "@/hooks/use-me";
import { AccountSecurityClient } from "./account-security-client";

// PAGE-ACCOUNT-SECURITY：全部成员（本人）
export default function AccountSecurityPage() {
  const me = useMe();
  if (me.isPending) return <LoadingRows />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  return <AccountSecurityClient me={me.data} />;
}
