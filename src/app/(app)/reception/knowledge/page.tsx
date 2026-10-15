"use client";

import { RequirePerm } from "@/components/shell/page";
import { KnowledgePage } from "./knowledge-client";

export default function ReceptionKnowledgePage() {
  return <RequirePerm perm="knowledge.manage">{(me) => <KnowledgePage me={me} />}</RequirePerm>;
}
