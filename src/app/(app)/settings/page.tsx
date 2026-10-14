"use client";

import { RequirePerm } from "@/components/shell/page";
import { ProfileClient } from "./profile-client";

export default function SettingsPage() {
  return <RequirePerm perm="settings.manage">{(me) => <ProfileClient me={me} />}</RequirePerm>;
}
