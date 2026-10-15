import { CardLanding } from "../card-landing";
import { ConversationScreen } from "../conversation-screen";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <CardLanding key={id} id={id}>
      <ConversationScreen id={id} />
    </CardLanding>
  );
}
