"use client";

import { RequirePerm } from "@/components/shell/page";
import { TicketsConfigClient } from "./tickets-client";

export default function ReceptionTicketsPage() {
  return <RequirePerm perm="reception.manage">{() => <TicketsConfigClient />}</RequirePerm>;
}
