import { MessagesSquareIcon } from "lucide-react";

export default function WorkbenchPage() {
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl bg-card p-6 text-center">
      <MessagesSquareIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium">从左侧选一个会话</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">待认领的会话按买家等待时间置顶；AI 草稿里的会话可以原样发送、改后发送或忽略。</p>
    </section>
  );
}
