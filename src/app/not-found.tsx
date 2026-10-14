import Link from "next/link";
import { Lockup } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "找不到页面 · Shopilot" };

// 未匹配的地址与 notFound()：与认证页同一版式（IA-008），说明原因并给出回去的路（IA-009）
export default function NotFound() {
  return (
    <main className="scroll-y flex h-dvh flex-col items-center bg-background px-6 py-10">
      <div className="my-auto flex w-full max-w-md flex-col items-center gap-6">
        <Lockup className="h-7" />
        <div className="w-full rounded-(--semantic-radius-lg) bg-card p-6">
          <p className="text-sm text-muted-foreground tabular-nums">404</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">找不到这个页面</h1>
          <p className="mt-2 text-sm text-muted-foreground">地址可能输错了，或者页面已经移走。可以回到工作台继续接待；还没登录时会先带你去登录页。</p>
          <Button asChild className="mt-6 w-full">
            <Link href="/wb">回到工作台</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
