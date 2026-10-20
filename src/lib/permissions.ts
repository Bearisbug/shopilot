// 权限表的唯一出处：由 docs/roles.md 权限表逐行转写。知识库转写「资料、问答与测试问答」与「产品清单」两行；助手本期不做，未列入。
// /team/permissions 页直接渲染 PERMISSION_TABLE；服务端鉴权与前端显隐都读这里。
export type Role = "admin" | "lead" | "agent";
export type Grant = "yes" | "scope" | "owner" | "no";

export const PERMISSION_TABLE = [
  { perm: "wb.handle", module: "工作台", action: "认领、回复负责店铺的会话；采纳或改写 AI 草稿", admin: "yes", lead: "yes", agent: "yes" },
  { perm: "wb.transfer", module: "工作台", action: "把自己处理中的会话转交给同事", admin: "yes", lead: "yes", agent: "yes" },
  { perm: "wb.team", module: "工作台", action: "查看负责店铺内别人处理中的会话、改派", admin: "yes", lead: "scope", agent: "no" },
  { perm: "wb.allShops", module: "工作台", action: "查看全部店铺的会话", admin: "yes", lead: "no", agent: "no" },
  { perm: "orders.use", module: "订单与开票", action: "查订单、取消订单、处理退货与取消申请、开票", admin: "yes", lead: "yes", agent: "yes" },
  { perm: "tickets.own", module: "工单", action: "建工单，处理指派给自己的工单", admin: "yes", lead: "yes", agent: "yes" },
  { perm: "tickets.manage", module: "工单", action: "查看负责店铺全部工单、改派、作废、改单张时限", admin: "yes", lead: "scope", agent: "no" },
  { perm: "dashboard.view", module: "看板", action: "查看看板", admin: "yes", lead: "scope", agent: "no" },
  { perm: "reception.manage", module: "接待设置", action: "接待模式、工作时间、提示词、工单类型与时限", admin: "yes", lead: "no", agent: "no" },
  { perm: "knowledge.manage", module: "知识库", action: "上传、查看、分类、停用、删除资料，录入、审核、发布问答，测试问答", admin: "yes", lead: "yes", agent: "no" },
  { perm: "products.manage", module: "知识库", action: "导入、修改、删除产品清单（物料编码与官方产品名称）", admin: "yes", lead: "no", agent: "no" },
  { perm: "shops.manage", module: "店铺与连接", action: "接入店铺、更新应用密钥、续期授权、断开", admin: "yes", lead: "no", agent: "no" },
  { perm: "team.manage", module: "团队与权限", action: "邀请成员、改角色、分配负责店铺、停用", admin: "yes", lead: "no", agent: "no" },
  { perm: "billing.manage", module: "用量与套餐", action: "查看用量、设预警、加购出稿包", admin: "yes", lead: "no", agent: "no" },
  { perm: "billing.owner", module: "用量与套餐", action: "改套餐、改付款方式", admin: "owner", lead: "no", agent: "no" },
  { perm: "settings.manage", module: "商户设置", action: "商户资料、通知、安全、数据、审计日志", admin: "yes", lead: "no", agent: "no" },
  { perm: "settings.owner", module: "商户设置", action: "转让所有权、删除商户", admin: "owner", lead: "no", agent: "no" },
] as const satisfies ReadonlyArray<{ perm: string; module: string; action: string; admin: Grant; lead: Grant; agent: Grant }>;

export type Permission = (typeof PERMISSION_TABLE)[number]["perm"];

export const ROLE_LABEL: Record<Role, string> = { admin: "管理员", lead: "组长", agent: "员工" };

export function can(role: Role, isOwner: boolean, perm: Permission): boolean {
  const row = PERMISSION_TABLE.find((r) => r.perm === perm);
  if (!row) return false;
  const grant = row[role] as Grant;
  if (grant === "owner") return isOwner;
  return grant !== "no";
}

export function permissionsFor(role: Role, isOwner: boolean): Permission[] {
  return PERMISSION_TABLE.filter((r) => can(role, isOwner, r.perm)).map((r) => r.perm);
}

/** 只对哪些角色开放，用于「这个页面只对 X 开放」 */
export function rolesWith(perm: Permission): Role[] {
  return (["admin", "lead", "agent"] as Role[]).filter((role) => can(role, role === "admin", perm));
}
