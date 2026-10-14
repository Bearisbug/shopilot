"use client";

import { RequirePerm } from "@/components/shell/page";
import { BoardClient } from "./board-client";

export default function TicketsBoardPage() {
  return <RequirePerm perm="tickets.own">{(me) => <BoardClient me={me} />}</RequirePerm>;
}
