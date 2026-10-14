import { Lockup } from "@/components/brand/logo";

// 认证页只留认证卡片（IA-008）：无侧栏、顶栏、页脚；短视口可滚动不裁切。
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="scroll-y flex h-dvh flex-col items-center bg-background px-6 py-10">
      <div className="my-auto flex w-full max-w-md flex-col items-center gap-6">
        <Lockup className="h-7" />
        <div className="w-full rounded-(--semantic-radius-lg) bg-card p-6">{children}</div>
      </div>
    </main>
  );
}
