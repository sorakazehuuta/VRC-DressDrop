import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanup, createUser, type TestUser } from "../helpers/db";

// 使い捨てメールアドレスの拒否（Supabase Auth の Before User Created フックが呼ぶ DB 関数）
const testDomain = `vrpl-${randomUUID().slice(0, 8)}.test`;
let me: TestUser;

beforeAll(async () => {
  const { error } = await admin.from("disposable_email_domains").insert({ domain: testDomain });
  if (error) throw error;
  me = await createUser();
});
afterAll(async () => {
  await admin.from("disposable_email_domains").delete().eq("domain", testDomain);
  await cleanup();
});

const hook = (email: string) => admin.rpc("hook_before_user_created", { event: { metadata: { name: "before-user-created" }, user: { email } } });

describe("使い捨てメールアドレスの判定", () => {
  it("一覧のドメインとそのサブドメインは拒否する（大文字でも）", async () => {
    for (const email of [`a@${testDomain}`, `a@sub.${testDomain}`, `A@${testDomain.toUpperCase()}`]) {
      const { data, error } = await hook(email);
      expect(error).toBeNull();
      expect(data.error.http_code, email).toBe(400);
      expect(data.error.message, email).toContain("disposable_email_domain");
    }
  });

  it("ほかのドメインと、メールアドレスのない登録は通す", async () => {
    for (const email of ["a@example.com", `a@not-${testDomain}`, ""]) {
      const { data, error } = await hook(email);
      expect(error).toBeNull();
      expect(data, email).toEqual({});
    }
  });

  it("一般の利用者は一覧を読めず、関数も実行できない", async () => {
    const { data } = await me.client.from("disposable_email_domains").select("domain").limit(1);
    expect(data ?? []).toEqual([]);
    const { error } = await me.client.rpc("hook_before_user_created", { event: { user: { email: `a@${testDomain}` } } });
    expect(error).not.toBeNull();
  });
});
