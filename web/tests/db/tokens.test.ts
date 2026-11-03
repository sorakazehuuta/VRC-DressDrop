import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { addLot, admin, balance, cleanup, createUser, createWork, lots, purchase, transactions } from "../helpers/db";

afterAll(cleanup);

describe("新規登録", () => {
  it("3トークンを付与し、有効期限は 180 日後", async () => {
    const u = await createUser();
    const [lot] = await lots(u.id);
    expect([lot.amount, lot.remaining, lot.source]).toEqual([3, 3, "signup_grant"]);
    const days = (new Date(lot.expires_at).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(179.9);
    expect(days).toBeLessThan(180.1);
    expect((await transactions(u.id)).map((t) => [t.reason, t.delta])).toEqual([["signup_grant", 3]]);
  });
});

describe("トークンの消費（purchase_work_version）", () => {
  it("有効期限が近いものから先に使い、ロットごとに履歴を残す", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    const soon = await addLot(u.id, 2, 10);
    const id = randomUUID();
    const { data, error } = await purchase(u.id, work, "v1", 4, id);
    expect(error).toBeNull();
    expect(data).toEqual([{ purchase_id: id, charged: 4 }]);
    const after = await lots(u.id);
    expect(after.find((l) => l.id === soon)!.remaining).toBe(0);
    expect(after.find((l) => l.source === "signup_grant")!.remaining).toBe(1);
    const consumed = (await transactions(u.id)).filter((t) => t.reason === "consume");
    expect(consumed.map((t) => [t.lot_id === soon ? "soon" : "signup", t.delta, t.ref_id])).toEqual([
      ["soon", -2, id],
      ["signup", -2, id],
    ]);
  });

  it("同じ版は2回目以降トークンを使わず、最初の購入を返す", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    const first = randomUUID();
    await purchase(u.id, work, "same", 1, first);
    const { data } = await purchase(u.id, work, "same", 1);
    expect(data).toEqual([{ purchase_id: first, charged: 0 }]);
    expect(await balance(u.id)).toBe(2);
  });

  it("同時に押されても1回分しか使わない（二重消費の防止）", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    const results = await Promise.all(Array.from({ length: 5 }, () => purchase(u.id, work, "race", 1)));
    const charged = results.map((r) => (r.data as { charged: number }[] | null)?.[0]?.charged ?? 0);
    expect(charged.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await balance(u.id)).toBe(2);
    const { count } = await admin.from("purchases").select("id", { count: "exact", head: true }).eq("user_id", u.id);
    expect(count).toBe(1);
  });

  it("残高が足りなければ insufficient_tokens で、何も変えない", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    const { error } = await purchase(u.id, work, "big", 4);
    expect(error?.message).toContain("insufficient_tokens");
    expect(await balance(u.id)).toBe(3);
    expect((await admin.from("purchases").select("id").eq("user_id", u.id)).data).toEqual([]);
  });

  it("期限切れのトークンは使えない", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    await addLot(u.id, 10, -1);
    expect((await purchase(u.id, work, "v", 4)).error?.message).toContain("insufficient_tokens");
    expect((await purchase(u.id, work, "v", 3)).error).toBeNull();
  });

  it("マイナス残高の分は使えない", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    await admin.from("profiles").update({ token_debt: 2 }).eq("id", u.id);
    expect((await purchase(u.id, work, "v", 2)).error?.message).toContain("insufficient_tokens");
    expect((await purchase(u.id, work, "v", 1)).error).toBeNull();
  });

  it("0 トークンの版（ギミックの設定値だけ変えた版など）は消費なしで記録する", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    const { data } = await purchase(u.id, work, "free", 0);
    expect((data as { charged: number }[])[0].charged).toBe(0);
    expect((await transactions(u.id)).filter((t) => t.reason === "consume")).toEqual([]);
  });

  it("停止中のアカウント・他人の作品・停止中の作品・負のトークン数は拒否する", async () => {
    const u = await createUser();
    const other = await createUser();
    const work = await createWork(u.id);
    expect((await purchase(other.id, work, "v", 1)).error?.message).toContain("work_not_found");
    expect((await purchase(u.id, work, "v", -1)).error?.message).toContain("invalid_cost");
    await admin.from("works").update({ status: "suspended" }).eq("id", work);
    expect((await purchase(u.id, work, "v", 1)).error?.message).toContain("work_not_found");
    await admin.from("works").update({ status: "active" }).eq("id", work);
    await admin.from("profiles").update({ status: "suspended" }).eq("id", u.id);
    expect((await purchase(u.id, work, "v", 1)).error?.message).toContain("account_suspended");
    expect(await balance(u.id)).toBe(3);
  });
});

describe("有効期限切れ（expire_token_lots）", () => {
  it("期限切れで残っている分を 0 にし、履歴に記録する。2回目は何もしない", async () => {
    const u = await createUser();
    const expired = await addLot(u.id, 4, -1);
    const { data: n } = await admin.rpc("expire_token_lots", { p_user_id: u.id });
    expect(n).toBe(1);
    expect((await lots(u.id)).find((l) => l.id === expired)!.remaining).toBe(0);
    expect((await transactions(u.id)).filter((t) => t.reason === "expire").map((t) => [t.delta, t.lot_id])).toEqual([[-4, expired]]);
    expect((await admin.rpc("expire_token_lots", { p_user_id: u.id })).data).toBe(0);
    expect(await balance(u.id)).toBe(3);
  });
});
