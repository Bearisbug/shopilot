import { ConversationScreen } from "../conversation-screen";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationScreen key={id} id={id} />;
}
