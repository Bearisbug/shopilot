"use client";

import { RequirePerm } from "@/components/shell/page";
import { TicketsClient } from "./tickets-client";

export default function TicketsPage() {
  return <RequirePerm perm="tickets.own">{(me) => <TicketsClient me={me} />}</RequirePerm>;
}
