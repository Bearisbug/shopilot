import { InviteClient } from "./invite-client";

export const metadata = { title: "接受邀请" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteClient token={token} />;
}
