import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { addLot, admin, balance, cleanup, createPayment, createUser, createWork, lots, purchase, transactions } from "../helpers/db";

afterAll(cleanup);

const adjust = (adminId: string, userId: string, delta: number, reason: string, refId: string | null = null) =>
  admin.rpc("admin_adjust_tokens", { p_admin_id: adminId, p_user_id: userId, p_delta: delta, p_reason: reason, p_ref_id: refId });

describe("管理者のトークン調整（admin_adjust_tokens）", () => {
  it("増やすと有効期限 180 日のトークンを付与し、理由・管理者・関係する ID を記録する", async () => {
    const op = await createUser({ admin: true });
    const u = await createUser();
    const ref = randomUUID();
    expect((await adjust(op.id, u.id, 2, "  二重消費の補填  ", ref)).data).toBe(2);
    const lot = (await lots(u.id)).find((l) => l.source === "admin")!;
    expect(lot.amount).toBe(2);
    expect((new Date(lot.expires_at).getTime() - Date.now()) / 86400000).toBeGreaterThan(179.9);
    const [tx] = (await transactions(u.id)).filter((t) => t.reason === "admin_adjust");
    expect(tx).toMatchObject({ delta: 2, note: "二重消費の補填", created_by: op.id, ref_id: ref });
  });

  it("減らすと有効期限が近いものから減らす。残高より多くは減らせない", async () => {
    const op = await createUser({ admin: true });
    const u = await createUser();
    const soon = await addLot(u.id, 1, 5);
    expect((await adjust(op.id, u.id, -2, "誤付与の取り消し")).data).toBe(-2);
    expect((await lots(u.id)).find((l) => l.id === soon)!.remaining).toBe(0);
    expect(await balance(u.id)).toBe(2);
    expect((await adjust(op.id, u.id, -3, "減らしすぎ")).error?.message).toContain("insufficient_tokens");
  });

  it("管理者以外・理由なし・0・大きすぎる数・存在しないユーザーは拒否する", async () => {
    const op = await createUser({ admin: true });
    const notAdmin = await createUser();
    const u = await createUser();
    expect((await adjust(notAdmin.id, u.id, 1, "x")).error?.message).toContain("not_admin");
    expect((await adjust(op.id, u.id, 1, "   ")).error?.message).toContain("reason_required");
    expect((await adjust(op.id, u.id, 0, "x")).error?.message).toContain("invalid_delta");
    expect((await adjust(op.id, u.id, 1001, "x")).error?.message).toContain("invalid_delta");
    expect((await adjust(op.id, randomUUID(), 1, "x")).error?.message).toContain("user_not_found");
    expect(await balance(u.id)).toBe(3);
  });
});

describe("退会の前処理（prepare_account_deletion）", () => {
  it("残高を 0 にして記録し、控えを削除済みにし、退会日を記録する。取引の記録は退会後も残る", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    await purchase(u.id, work, "v", 1);
    await admin.from("purchases").update({ snapshot: { images: { a: "x" }, params: {} }, thumbnail_path: "t.jpg" }).eq("user_id", u.id);
    expect((await admin.rpc("prepare_account_deletion", { p_user_id: u.id })).error).toBeNull();
    expect(await balance(u.id)).toBe(0);
    expect((await transactions(u.id)).filter((t) => t.reason === "account_deleted").map((t) => t.delta)).toEqual([-2]);
    const [p] = (await admin.from("purchases").select("package_path, thumbnail_path, snapshot, snapshot_deleted_at").eq("user_id", u.id)).data!;
    expect(p).toMatchObject({ package_path: null, thumbnail_path: null, snapshot: { params: {} } });
    expect(p.snapshot_deleted_at).not.toBeNull();
    expect((await admin.from("deleted_accounts").select("user_id").eq("user_id", u.id)).data).toHaveLength(1);

    await admin.auth.admin.deleteUser(u.id);
    expect((await admin.from("purchases").select("id").eq("user_id", u.id)).data).toHaveLength(1);
    expect((await transactions(u.id)).length).toBeGreaterThan(0);
    expect((await admin.from("works").select("id").eq("id", work)).data).toEqual([]);
    // 2回呼んでも壊れない
    expect((await admin.rpc("prepare_account_deletion", { p_user_id: u.id })).error).toBeNull();
  });

  it("コンビニの支払い待ちがある間は payment_pending で止める", async () => {
    const u = await createUser();
    await createPayment(u.id, 5, 1000, "awaiting_payment");
    expect((await admin.rpc("prepare_account_deletion", { p_user_id: u.id })).error?.message).toContain("payment_pending");
    expect(await balance(u.id)).toBe(3);
  });
});
