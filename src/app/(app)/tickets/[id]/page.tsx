"use client";

import { useParams } from "next/navigation";
import { RequirePerm } from "@/components/shell/page";
import { MerchantLanding } from "./merchant-landing";
import { TicketDetailClient } from "./ticket-detail-client";

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePerm perm="tickets.own">
      {(me) => (
        <MerchantLanding>
          <TicketDetailClient me={me} id={id} />
        </MerchantLanding>
      )}
    </RequirePerm>
  );
}
