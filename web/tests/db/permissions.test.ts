import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanup, createUser, createWork, purchase, type TestUser } from "../helpers/db";

// ログインした一般の利用者（ブラウザから送れるのと同じ権限）で、できてはいけないことを確かめる
let me: TestUser;
let other: TestUser;
let otherWork: string;

beforeAll(async () => {
  me = await createUser();
  other = await createUser();
  otherWork = await createWork(other.id);
  await purchase(other.id, otherWork, "v", 1);
});
afterAll(cleanup);

const denied = (error: { message: string; code?: string } | null) => Boolean(error) && /permission denied|42501/i.test(`${error!.code} ${error!.message}`);

describe("他人のデータ", () => {
  it("他人の作品・購入・トークン・支払い・プロフィールは読めない", async () => {
    for (const table of ["works", "purchases", "token_lots", "token_transactions", "payments"]) {
      const { data } = await me.client.from(table).select("id").eq("user_id", other.id);
      expect(data, table).toEqual([]);
    }
    expect((await me.client.from("profiles").select("id").eq("id", other.id)).data).toEqual([]);
  });

  it("他人の作品は変更・削除できない", async () => {
    await me.client.from("works").update({ name: "乗っ取り" }).eq("id", otherWork);
    await me.client.from("works").delete().eq("id", otherWork);
    expect((await admin.from("works").select("name").eq("id", otherWork).single()).data!.name).toBe("テストの作品");
  });

  it("自分の作品・購入は読める", async () => {
    const mine = await createWork(me.id);
    expect((await me.client.from("works").select("id").eq("id", mine)).data).toHaveLength(1);
  });
});

describe("トークン・お金", () => {
  it("自分のトークンを増やす・書き換えることはできない", async () => {
    const insert = await me.client.from("token_lots").insert({ user_id: me.id, amount: 100, remaining: 100, source: "admin" });
    expect(insert.error).not.toBeNull();
    await me.client.from("token_lots").update({ remaining: 100 }).eq("user_id", me.id);
    const { data } = await admin.from("token_lots").select("remaining").eq("user_id", me.id);
    expect(data!.every((l) => l.remaining <= 3)).toBe(true);
  });

  it("自分を管理者にしたり、停止やマイナス残高を消したり、同意した規約の版を書き換えたりできない", async () => {
    const u = await createUser();
    await admin.from("profiles").update({ status: "suspended", token_debt: 5 }).eq("id", u.id);
    for (const change of [{ is_admin: true }, { status: "active" }, { token_debt: 0 }, { terms_version: "fake" }]) {
      await u.client.from("profiles").update(change).eq("id", u.id);
    }
    const { data } = await admin.from("profiles").select("is_admin, status, token_debt, terms_version").eq("id", u.id).single();
    expect(data).toEqual({ is_admin: false, status: "suspended", token_debt: 5, terms_version: null });
  });

  it("表示名は自分で変えられる", async () => {
    const { error } = await me.client.from("profiles").update({ display_name: "新しい名前" }).eq("id", me.id);
    expect(error).toBeNull();
    expect((await admin.from("profiles").select("display_name").eq("id", me.id).single()).data!.display_name).toBe("新しい名前");
  });

  it("購入の記録を自分で作れない", async () => {
    const mine = await createWork(me.id);
    const { error } = await me.client.from("purchases").insert({ work_id: mine, user_id: me.id, params_hash: "free", token_spent: 0 });
    expect(error).not.toBeNull();
  });

  it("お金・トークンを動かす関数と管理者用の関数は呼べない", async () => {
    const calls = [
      me.client.rpc("purchase_work_version", {
        p_user_id: me.id,
        p_work_id: otherWork,
        p_params_hash: "x",
        p_cost: 0,
        p_purchase_id: randomUUID(),
        p_package_path: "x",
        p_work_name: "x",
        p_template_name: "x",
      }),
      me.client.rpc("complete_token_payment", { p_payment_id: randomUUID(), p_payment_intent_id: null, p_payment_method_type: null, p_card_fingerprint: null }),
      me.client.rpc("revoke_token_payment", { p_payment_id: randomUUID(), p_kind: "refund" }),
      me.client.rpc("expire_token_lots", { p_user_id: other.id }),
      me.client.rpc("admin_adjust_tokens", { p_admin_id: me.id, p_user_id: me.id, p_delta: 100, p_reason: "x", p_ref_id: null }),
      me.client.rpc("prepare_account_deletion", { p_user_id: other.id }),
      me.client.rpc("admin_search_users", { p_query: "" }),
      me.client.rpc("admin_monthly_stats", { p_months: 1 }),
      me.client.rpc("admin_shared_cards"),
    ];
    for (const [i, { error }] of (await Promise.all(calls)).entries()) expect(denied(error), `関数 ${i}`).toBe(true);
  });

  it("自分の残高は get_token_balance で読める", async () => {
    expect((await me.client.rpc("get_token_balance")).data).toBe(3);
  });
});

describe("管理者だけの表", () => {
  it("削除キュー・管理者の操作・退会の記録・ブロックしたカードは読めない", async () => {
    for (const table of ["storage_deletions", "admin_actions", "deleted_accounts", "blocked_cards"]) {
      const { data } = await me.client.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
  });
});
