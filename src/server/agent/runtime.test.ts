// Agent 服务（需要数据库，AI_MODE=stub，走进程内替身与真的 CLI 子进程）：交回结论并记运行；提交被退回后改好再交；没提交、超时、超出用量都记失败；
// 工具次数到上限不执行；工具出错交给模型、不中断运行；临时目录用完即删；运行中超过 15 分钟的由补扫标中断。
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

describe.skipIf(!process.env.DATABASE_URL)("Agent 服务（需要数据库）", { timeout: 120_000 }, async () => {
  process.env.AI_MODE = "stub";
  const { db, pool, schema } = await import("@/server/db/client");
  const { provisionMerchant } = await import("@/server/merchants/provision");
  const { runAgent, AgentError, failStaleAgentRuns } = await import("./runtime");
  const { defineTool } = await import("./tools/registry");
  type Submit = import("./tools/registry").AgentSubmit<string>;

  let merchantId = "";
  let userId = "";
  beforeAll(async () => {
    userId = `test-${randomUUID()}`;
    await db().insert(schema.user).values({ id: userId, name: "Agent 测试", email: `${userId}@test.invalid` });
    const res = await db().transaction((tx) => provisionMerchant(tx, { name: "Agent 测试", timezone: "Asia/Kuala_Lumpur", ownerUserId: userId }));
    merchantId = res.merchant.id;
  });
  afterAll(async () => {
    if (merchantId) await db().delete(schema.merchant).where(eq(schema.merchant.id, merchantId));
    if (userId) await db().delete(schema.user).where(inArray(schema.user.id, [userId]));
    await pool().end();
  });

  const echo = defineTool({ name: "echo", description: "原样返回文字", tier: "read", input: { text: z.string() }, run: async ({ text }) => ({ result: `echo: ${text}`, note: `回了 ${[...text].length} 个字` }) });
  const once = defineTool({ name: "once", description: "只能调一次", tier: "read", max: 1, input: {}, run: async () => ({ result: "ok", note: "调了一次" }) });
  const broken = defineTool({ name: "broken", description: "总是出错", tier: "read", input: {}, run: async () => Promise.reject(new Error("坏了")) });
  const slow = defineTool({ name: "slow", description: "很慢", tier: "read", input: {}, run: () => new Promise((r) => setTimeout(() => r({ result: "迟到", note: "迟到" }), 20_000)) });
  /** 值为 bad 时退回 */
  const submit: Submit = {
    description: "提交",
    input: { value: z.string() },
    accept: (a) => (a.value === "bad" ? { ok: false, error: "值不对。" } : { ok: true, output: String(a.value), note: `交回 ${String(a.value)}` }),
  };
  const script = (calls: Array<{ name: string; input?: Record<string, unknown> }>) => `替身脚本：${JSON.stringify(calls.map((c) => ({ name: c.name, input: c.input ?? {} })))}`;
  const run = (prompt: string, tools = [echo], over: Partial<Parameters<typeof runAgent<string>>[0]> = {}) =>
    runAgent({ purpose: "learn", merchantId, learningTaskId: null, system: "测试", prompt, tools, submit, ...over });
  const runRow = async (id: string) => (await db().select().from(schema.agentRun).where(eq(schema.agentRun.id, id)))[0];
  const lastRun = async () => (await db().select().from(schema.agentRun).where(eq(schema.agentRun.merchantId, merchantId))).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  const agentDirs = async () => (await readdir(tmpdir())).filter((n) => n.startsWith("shopilot-agent-")).length;
  const errorOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      if (e instanceof AgentError) return e;
      throw e;
    }
    throw new Error("没有抛出 AgentError");
  };

  it("调工具后交回结论：记成功、工具步骤、轮数与 token，临时目录删掉", async () => {
    const dirs = await agentDirs();
    const r = await run(script([{ name: "echo", input: { text: "你好" } }, { name: "submit", input: { value: "结论" } }]));
    expect(r.output).toBe("结论");
    const row = await runRow(r.runId);
    expect(row).toMatchObject({ status: "succeeded", error: null, model: "stub", purpose: "learn", toolCalls: 2 });
    expect(row.steps.map((s) => [s.tool, s.ok, s.note])).toEqual([
      ["echo", true, "回了 2 个字"],
      ["submit", true, "交回 结论"],
    ]);
    expect(row.turns).toBeGreaterThanOrEqual(3);
    expect(row.inputTokens).toBeGreaterThanOrEqual(3000);
    expect(row.finishedAt).not.toBeNull();
    expect(await agentDirs()).toBe(dirs);
  });

  it("提交被退回时改好再交，只认第一次通过的", async () => {
    let n = 0;
    const r = await run(script([{ name: "submit", input: { value: "bad" } }]), [echo], {
      submit: { ...submit, accept: (a) => (n++ === 0 ? { ok: false, error: "值不对。" } : { ok: true, output: String(a.value), note: "第二次收下" }) },
    });
    expect(r.output).toBe("bad");
    expect((await runRow(r.runId)).steps.map((s) => [s.tool, s.ok])).toEqual([
      ["submit", false],
      ["submit", true],
    ]);
  });

  it("没提交就结束：记失败「没有提交结论」", async () => {
    const e = await errorOf(run(script([{ name: "echo", input: { text: "a" } }])));
    expect(e.kind).toBe("no_submit");
    expect(await lastRun()).toMatchObject({ status: "failed", toolCalls: 1 });
    expect((await lastRun()).error).toMatch(/^没有提交结论/);
  });

  it("工具调用与单个工具次数到上限后不执行，工具出错交给模型，运行照常交回", async () => {
    const r = await run(
      script([{ name: "once" }, { name: "once" }, { name: "broken" }, { name: "echo", input: { text: "超" } }, { name: "submit", input: { value: "ok" } }]),
      [echo, once, broken],
      { limits: { toolCalls: 3 } },
    );
    expect((await runRow(r.runId)).steps.map((s) => [s.tool, s.ok, s.note])).toEqual([
      ["once", true, "调了一次"],
      ["once", false, "已到次数上限，没有执行"],
      ["broken", false, "出错：坏了"],
      ["echo", false, "已到次数上限，没有执行"],
      ["submit", true, "交回 ok"],
    ]);
  });

  it("token 超出上限：中止并记失败「超出用量」", async () => {
    const e = await errorOf(run(script([{ name: "echo", input: { text: "a" } }, { name: "echo", input: { text: "b" } }, { name: "submit", input: { value: "x" } }]), [echo], { limits: { tokens: 1500 } }));
    expect(e.kind).toBe("budget");
    expect((await lastRun()).error).toMatch(/^超出用量/);
  });

  it("超时：中止并记失败「超时」，临时目录删掉", async () => {
    const dirs = await agentDirs();
    const e = await errorOf(run(script([{ name: "slow" }, { name: "submit", input: { value: "x" } }]), [slow], { limits: { timeoutMs: 6_000 } }));
    expect(e.kind).toBe("timeout");
    expect(await lastRun()).toMatchObject({ status: "failed" });
    expect((await lastRun()).error).toMatch(/^超时/);
    expect(await agentDirs()).toBe(dirs);
  });

  it("运行中超过 15 分钟的由补扫标「运行中断」，刚开始的不动", async () => {
    const [old] = await db().insert(schema.agentRun).values({ merchantId, purpose: "learn", model: "stub", startedAt: new Date(Date.now() - 16 * 60_000) }).returning();
    const [fresh] = await db().insert(schema.agentRun).values({ merchantId, purpose: "learn", model: "stub" }).returning();
    await failStaleAgentRuns(15 * 60_000);
    expect(await runRow(old.id)).toMatchObject({ status: "failed", error: "运行中断：进程在运行中退出" });
    expect((await runRow(fresh.id)).status).toBe("running");
  });
});
