"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { ConversationListPanel } from "./conversation-list";
import { ConversationPlaceholder } from "./conversation-placeholder";
import { setPendingOpen, usePendingOpen } from "./wb-shared";

// 工作台三栏（RESP-009：外壳定高，各栏自己滚动）：列表常驻，切换会话不重载列表；窄屏只显示列表或会话之一。
// 右栏是否并排按本容器宽度判断（@container/wb，见 BuyerColumn），侧栏展开收起都算得对
export function WorkbenchFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selectedId = pathname.startsWith("/wb/") ? (pathname.split("/")[2] ?? null) : null;
  // 点下会话行、新路由还没就位：先显示被点会话的占位，列表高亮跟着换（见 setPendingOpen）
  const pending = usePendingOpen();
  const opening = pending && pending.from === selectedId ? pending.item : null;
  useEffect(() => {
    if (pending && pending.from !== selectedId) setPendingOpen(null);
  }, [pending, selectedId]);
  // 导航没走成（断网、被拦）时地址不会变：过一阵放弃占位，退回当前会话
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPendingOpen(null), 15_000);
    return () => clearTimeout(t);
  }, [pending]);
  useEffect(() => () => setPendingOpen(null), []);
  const shownId = opening?.id ?? selectedId;
  return (
    <div className="@container/wb flex min-h-0 flex-1 gap-4 pb-6">
      <ConversationListPanel selectedId={shownId} className={cn("w-full md:w-[clamp(16rem,24vw,20rem)] md:shrink-0", shownId ? "hidden md:flex" : "flex")} />
      <div className={cn("min-h-0 min-w-0 flex-1 gap-4", shownId ? "flex" : "hidden md:flex")}>{opening ? <ConversationPlaceholder item={opening} withBuyer /> : children}</div>
    </div>
  );
}
