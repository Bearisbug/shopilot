"use client";

import { RequirePerm } from "@/components/shell/page";
import { DashboardClient } from "./dashboard-client";

// PAGE-DASHBOARD（/dashboard）：管理员看全部店铺，组长看负责店铺，员工原位显示无权说明
export default function DashboardPage() {
  return <RequirePerm perm="dashboard.view">{(me) => <DashboardClient me={me} />}</RequirePerm>;
}
