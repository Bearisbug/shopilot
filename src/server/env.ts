import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url(),
  APP_ENCRYPTION_KEY: z.string().min(40),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default("deepseek-flash"),
  AI_MODE: z.enum(["deepseek", "stub"]).default("stub"),
  MOCK_PLATFORM: z.enum(["0", "1"]).default("0"),
  SHOPEE_HOSTS: z.string().min(1),
  TIKTOK_API_HOST: z.string().url(),
  TIKTOK_AUTH_HOST: z.string().url(),
  // 卖家授权页地址模板，{service_id} 换成应用的 Service ID；不配时用 TIKTOK_AUTH_HOST/open/authorize（本机模拟平台）
  TIKTOK_AUTHORIZE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .refine((v) => URL.canParse(v.replace("{service_id}", "0")), "不是有效的地址模板")
      .optional(),
  ),
  DATA_DIR: z.string().default("./data"),
  // 真实发信（SMTP）；三项都配了才发，否则邮件只写发件箱
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`环境变量缺失或格式不对：${keys}（见 .env.example）`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const mockPlatformEnabled = () => process.env.MOCK_PLATFORM === "1";

export const smtpEnabled = () => {
  const e = env();
  return Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS);
};

/** SHOPEE_HOSTS = "cn=https://…,sg=https://…" → [{ region, host }]，按书写顺序尝试 */
export function shopeeHosts(): Array<{ region: string; host: string }> {
  return env()
    .SHOPEE_HOSTS.split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [region, host] = pair.split("=");
      return { region: region.trim(), host: host.trim().replace(/\/$/, "") };
    });
}
