"use client";

import { RequirePerm } from "@/components/shell/page";
import { PromptsClient } from "./prompts-client";

export default function ReceptionPromptsPage() {
  return <RequirePerm perm="reception.manage">{(me) => <PromptsClient me={me} />}</RequirePerm>;
}
