// 真实发信（Worker 任务 email.send）：按 email_outbox 的一行经 SMTP 发出，成功后记为已送达。
import { eq, inArray } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { db, schema } from "../db/client";
import { env } from "../env";
import { dataPath } from "../files/storage";

let transport: Transporter | undefined;

function mailer() {
  if (!transport) {
    const e = env();
    transport = nodemailer.createTransport({ host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_PORT === 465, auth: { user: e.SMTP_USER, pass: e.SMTP_PASS } });
  }
  return transport;
}

export async function deliverEmail(data: Record<string, unknown>): Promise<void> {
  const id = String(data.id);
  const [row] = await db().select().from(schema.emailOutbox).where(eq(schema.emailOutbox.id, id));
  // 写入它的事务可能还没提交：抛错交给队列按间隔重试
  if (!row) throw new Error(`邮件 ${id} 尚不可见`);
  if (row.status !== "queued") return;
  const links = row.links.map((l) => `${l.label}：${l.url}`).join("\n");
  const fileIds = row.attachments.map((a) => a.fileId);
  const files = fileIds.length ? await db().select().from(schema.file).where(inArray(schema.file.id, fileIds)) : [];
  const attachments = row.attachments.flatMap((a) => {
    const f = files.find((x) => x.id === a.fileId);
    return f ? [{ filename: a.name, path: dataPath(f.path), contentType: f.mime }] : [];
  });
  const e = env();
  await mailer().sendMail({
    from: e.SMTP_FROM ?? `Shopilot <${e.SMTP_USER}>`,
    to: row.toEmail,
    subject: row.subject,
    text: links ? `${row.body}\n\n${links}` : row.body,
    attachments,
  });
  await db().update(schema.emailOutbox).set({ status: "delivered" }).where(eq(schema.emailOutbox.id, id));
}
