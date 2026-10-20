import { z } from "zod";
import { charCount } from "./reception";

// 看板「问题提取」的类别契约：前后端共用。

/** 内置类别，不能改名、删除；删除其他类别时其中会话段归到这里，AI 归不进任何类别时也落在这里 */
export const ISSUE_OTHER = "其他";
/** 开通商户与迁移时建的默认类别（按此顺序显示，「其他」最后） */
export const DEFAULT_ISSUE_CATEGORIES = ["物流查询", "退换货与退款", "产品使用与故障", "商品咨询（库存、规格、价格）", "优惠与活动", "开票", "订单修改与取消", ISSUE_OTHER] as const;
export const ISSUE_CATEGORY_LIMIT = 30;
const ISSUE_CATEGORY_NAME_MAX = 20;
/** 一句话问题总结的长度上限（字） */
export const ISSUE_SUMMARY_MAX = 60;

export const issueCategoryBody = z.object({
  name: z
    .string()
    .trim()
    .refine((s) => charCount(s) >= 1, "请填写类别名")
    .refine((s) => charCount(s) <= ISSUE_CATEGORY_NAME_MAX, `类别名最多 ${ISSUE_CATEGORY_NAME_MAX} 个字`),
});

export type IssueCategory = { id: string; name: string; builtin: boolean };
/** segmentCount：归在这个类别下的会话段（全部时间） */
export type IssueCategoryList = { items: Array<IssueCategory & { segmentCount: number }> };
export type IssueCategoryDeleteResult = { movedSegments: number };
