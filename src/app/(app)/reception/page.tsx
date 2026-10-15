"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingRows, RequirePerm } from "@/components/shell/page";
import { useMe } from "@/hooks/use-me";
import { ModesClient } from "./modes-client";

export default function ReceptionPage() {
  const me = useMe();
  const router = useRouter();
  const perms = me.data?.active.permissions;
  // 组长只有知识库（knowledge.manage）：打开 /reception 直接进知识库页
  const toKnowledge = Boolean(perms && !perms.includes("reception.manage") && perms.includes("knowledge.manage"));
  useEffect(() => {
    if (toKnowledge) router.replace("/reception/knowledge");
  }, [toKnowledge, router]);
  if (toKnowledge) return <LoadingRows />;
  return <RequirePerm perm="reception.manage">{() => <ModesClient />}</RequirePerm>;
}
