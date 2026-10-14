// 发件箱（DESIGN §17）：要发的邮件一律写入 email_outbox。配了 SMTP 时记为排队，由 Worker 的 email.send 真实发出；
// 没配时（本机开发）直接记为已送达，开发页 /dev/outbox 查看。
import { db, schema, type Executor } from "../db/client";
import { smtpEnabled } from "../env";
import { enqueue } from "../jobs/boss";

export type EmailTemplate =
  | "verify_email" | "invitation" | "password_reset" | "invoice" | "usage_alert" | "ticket_alert"
  | "ownership_transfer" | "merchant_deletion" | "export_ready" | "auth_expiring" | "notification";

export async function sendEmail(
  input: {
    to: string;
    template: EmailTemplate;
    subject: string;
    body: string;
    links?: Array<{ label: string; url: string }>;
    attachments?: Array<{ fileId: string; name: string }>;
    merchantId?: string | null;
    refType?: string;
    refId?: string;
  },
  tx: Executor = db(),
) {
  const [row] = await tx
    .insert(schema.emailOutbox)
    .values({
      merchantId: input.merchantId ?? null,
      toEmail: input.to.toLowerCase(),
      template: input.template,
      subject: input.subject,
      body: input.body,
      links: input.links ?? [],
      attachments: input.attachments ?? [],
      status: smtpEnabled() ? "queued" : "delivered",
      refType: input.refType,
      refId: input.refId,
    })
    .returning({ id: schema.emailOutbox.id, status: schema.emailOutbox.status });
  // 调用方可能还在事务里：延后 2 秒入队；事务尚未提交时任务读不到这行，会按重试间隔再取
  if (row.status === "queued") await enqueue("email.send", { id: row.id }, { startAfter: 2 });
  return row.id;
}
