"use client";

import { RequirePerm } from "@/components/shell/page";
import { HoursClient } from "./hours-client";

export default function ReceptionHoursPage() {
  return <RequirePerm perm="reception.manage">{() => <HoursClient />}</RequirePerm>;
}
