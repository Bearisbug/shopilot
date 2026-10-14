"use client";

import { RequirePerm } from "@/components/shell/page";
import { TeamClient } from "./team-client";

export default function TeamPage() {
  return <RequirePerm perm="team.manage">{(me) => <TeamClient me={me} />}</RequirePerm>;
}
