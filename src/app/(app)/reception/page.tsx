"use client";

import { RequirePerm } from "@/components/shell/page";
import { ModesClient } from "./modes-client";

export default function ReceptionPage() {
  return <RequirePerm perm="reception.manage">{() => <ModesClient />}</RequirePerm>;
}
