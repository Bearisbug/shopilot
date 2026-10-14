"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConversationListPanel } from "./conversation-list";

// 工作台三栏（RESP-009：外壳定高，各栏自己滚动）：列表常驻，切换会话不重载列表；窄屏只显示列表或会话之一。
// 右栏是否并排按本容器宽度判断（@container/wb，见 BuyerColumn），侧栏展开收起都算得对
export function WorkbenchFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selectedId = pathname.startsWith("/wb/") ? (pathname.split("/")[2] ?? null) : null;
  return (
    <div className="@container/wb flex min-h-0 flex-1 gap-4 pb-6">
      <ConversationListPanel selectedId={selectedId} className={cn("w-full md:w-[clamp(16rem,24vw,20rem)] md:shrink-0", selectedId ? "hidden md:flex" : "flex")} />
      <div className={cn("min-h-0 min-w-0 flex-1 gap-4", selectedId ? "flex" : "hidden md:flex")}>{children}</div>
    </div>
  );
}
