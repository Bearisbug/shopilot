"use client";

import { RequirePerm } from "@/components/shell/page";
import { OrdersClient } from "./orders-client";

export default function OrdersPage() {
  return <RequirePerm perm="orders.use">{(me) => <OrdersClient me={me} />}</RequirePerm>;
}
