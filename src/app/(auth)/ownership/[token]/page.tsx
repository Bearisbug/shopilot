import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { previewTransfer } from "@/server/settings/ownership";
import { OwnershipClient } from "./ownership-client";

export const metadata = { title: "接受账号所有权" };

// PAGE-OWNERSHIP：受让管理员确认；未登录先去登录，登录后回到这里
export default async function OwnershipPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // 先取 headers()：页面由此标为动态，构建时不会在没有环境变量的情况下调用 auth()
  const h = await headers();
  const session = await auth().api.getSession({ headers: h });
  if (!session) redirect(`/login?next=${encodeURIComponent(`/ownership/${token}`)}`);
  const preview = await previewTransfer(token, session.user.id);
  return <OwnershipClient token={token} preview={preview} account={{ name: session.user.name, email: session.user.email }} />;
}
