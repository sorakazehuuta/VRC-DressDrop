import { afterAll, describe, expect, it } from "vitest";
import { admin, balance, cleanup, completePayment, createPayment, createUser, createWork, lots, newFingerprint, purchase, transactions } from "../helpers/db";

afterAll(cleanup);

const status = async (paymentId: string) => (await admin.from("payments").select("status").eq("id", paymentId).single()).data!.status;
const revoke = (paymentId: string, kind: "refund" | "chargeback") => admin.rpc("revoke_token_payment", { p_payment_id: paymentId, p_kind: kind });

describe("決済の完了（complete_token_payment）", () => {
  it("トークンを付与し、同じ通知が何度届いても1回だけ", async () => {
    const u = await createUser();
    const pay = await createPayment(u.id, 5, 1000);
    expect((await completePayment(pay)).data).toBe("completed");
    expect((await completePayment(pay)).data).toBe("completed");
    const purchased = (await lots(u.id)).filter((l) => l.source === "purchase");
    expect(purchased.map((l) => [l.amount, l.remaining, l.payment_id])).toEqual([[5, 5, pay]]);
    expect((await transactions(u.id)).filter((t) => t.reason === "purchase").map((t) => [t.delta, t.note])).toEqual([[5, "5トークン（1000円）"]]);
    expect(await status(pay)).toBe("completed");
    expect(await balance(u.id)).toBe(8);
  });

  it("マイナス残高があれば、付与した分から先に相殺する", async () => {
    const u = await createUser();
    await admin.from("profiles").update({ token_debt: 2 }).eq("id", u.id);
    await completePayment(await createPayment(u.id, 5, 1000));
    expect((await lots(u.id)).find((l) => l.source === "purchase")!.remaining).toBe(3);
    expect((await admin.from("profiles").select("token_debt").eq("id", u.id).single()).data!.token_debt).toBe(0);
    expect(await balance(u.id)).toBe(6);
  });

  it("チャージバックが起きたカードの支払いは、付与せず blocked にする", async () => {
    const u = await createUser();
    const fp = newFingerprint();
    await admin.from("blocked_cards").insert({ card_fingerprint: fp, reason: "test" });
    const pay = await createPayment(u.id, 5, 1000);
    expect((await completePayment(pay, fp)).data).toBe("blocked");
    expect(await status(pay)).toBe("blocked");
    expect(await balance(u.id)).toBe(3);
  });

  it("退会したアカウントの支払いは、付与せず account_deleted にする（返金はアプリ側で行う）", async () => {
    const u = await createUser();
    const pay = await createPayment(u.id, 5, 1000, "awaiting_payment");
    await admin.from("payments").update({ status: "created" }).eq("id", pay);
    await admin.rpc("prepare_account_deletion", { p_user_id: u.id });
    await admin.auth.admin.deleteUser(u.id);
    expect((await completePayment(pay)).data).toBe("account_deleted");
    expect(await status(pay)).toBe("account_deleted");
    expect((await lots(u.id)).filter((l) => l.source === "purchase")).toEqual([]);
  });
});

describe("返金（revoke_token_payment refund）", () => {
  it("その支払いで付与したトークンのうち、未使用の分だけを取り消す", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    // 新規登録の3トークンを先に使い切ってから、購入した分を2つ使う
    await purchase(u.id, work, "a", 3);
    const pay = await createPayment(u.id, 5, 1000);
    await completePayment(pay);
    await purchase(u.id, work, "b", 2);
    expect((await revoke(pay, "refund")).data).toBe(3);
    expect(await status(pay)).toBe("refunded");
    expect(await balance(u.id)).toBe(0);
    expect((await transactions(u.id)).filter((t) => t.reason === "refund").map((t) => t.delta)).toEqual([-3]);
    expect((await revoke(pay, "refund")).data).toBe(0);
  });

  it("付与する前の支払い（コンビニの支払い待ちなど）は、状態だけを変える", async () => {
    const u = await createUser();
    const pay = await createPayment(u.id, 5, 1000, "awaiting_payment");
    expect((await revoke(pay, "refund")).data).toBe(0);
    expect(await status(pay)).toBe("refunded");
    expect(await balance(u.id)).toBe(3);
  });
});

describe("チャージバック（revoke_token_payment chargeback）", () => {
  it("未使用の分を取り消し、使用済みの分はマイナス残高にし、カードをブロックしてアカウントを停止する", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    await purchase(u.id, work, "a", 3);
    const fp = newFingerprint();
    const pay = await createPayment(u.id, 5, 1000);
    await completePayment(pay, fp);
    await purchase(u.id, work, "b", 2);
    expect((await revoke(pay, "chargeback")).data).toBe(5);
    const profile = (await admin.from("profiles").select("status, token_debt").eq("id", u.id).single()).data!;
    expect(profile).toEqual({ status: "suspended", token_debt: 2 });
    expect(await balance(u.id)).toBe(-2);
    expect(await status(pay)).toBe("disputed");
    expect((await admin.from("blocked_cards").select("payment_id").eq("card_fingerprint", fp).single()).data!.payment_id).toBe(pay);
    expect((await transactions(u.id)).filter((t) => t.reason === "chargeback").map((t) => t.delta)).toEqual([-3, -2]);
    expect((await revoke(pay, "chargeback")).data).toBe(0);
  });

  it("マイナス残高の間はダウンロードできず、あとから買ったトークンで相殺される", async () => {
    const u = await createUser();
    const work = await createWork(u.id);
    await admin.from("profiles").update({ token_debt: 2 }).eq("id", u.id);
    await admin.from("token_lots").update({ remaining: 0 }).eq("user_id", u.id);
    expect((await purchase(u.id, work, "x", 1)).error?.message).toContain("insufficient_tokens");
    await completePayment(await createPayment(u.id, 5, 1000));
    expect(await balance(u.id)).toBe(3);
    expect((await purchase(u.id, work, "x", 1)).error).toBeNull();
  });
});
