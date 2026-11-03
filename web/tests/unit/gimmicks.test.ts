import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gimmickConflict, gimmickDefinitionSchema, parseGimmickSelection, type GimmickDefinition } from "@/lib/gimmicks/schema";

// 実際のギミック定義（gimmicks/catalog）を読み込んで使う
const CATALOG = path.join(process.cwd(), "gimmicks", "catalog");
const RUNTIME = path.join(process.cwd(), "gimmicks", "unity", "Runtime");
const files = readdirSync(CATALOG).filter((f) => f.endsWith(".json"));
const defs = new Map<string, GimmickDefinition>(
  files.map((f) => {
    const def = gimmickDefinitionSchema.parse(JSON.parse(readFileSync(path.join(CATALOG, f), "utf8")));
    return [def.slug, def];
  }),
);
const get = (slug: string) => defs.get(slug)!;
const sel = (...slugs: string[]) => slugs.map((slug) => ({ slug, params: {} }));

describe("ギミック定義（catalog）", () => {
  it("すべての定義が正しく、ファイル名と slug が一致する", () => {
    for (const f of files) expect(get(f.replace(/\.json$/, "")), f).toBeDefined();
  });

  it("スクリプトを使う定義は、Unity のスクリプトが存在する", () => {
    for (const def of defs.values()) {
      if (def.script) expect(existsSync(path.join(RUNTIME, `${def.script}.cs`)), def.slug).toBe(true);
    }
  });

  it("requiresAny に書いたギミックが存在する", () => {
    for (const def of defs.values()) for (const slug of def.requiresAny) expect(defs.has(slug), `${def.slug} → ${slug}`).toBe(true);
  });
});

describe("組み合わせの判定", () => {
  it("同じグループ（例: 回転と段階回転）は同時に選べない", () => {
    expect(gimmickConflict(get("step-rotate"), sel("spin"), defs)).toMatch(/同時には使えません/);
  });

  it("触ったときの動作は1つだけ", () => {
    expect(gimmickConflict(get("toggle-light"), sel("toggle-particles"), defs)).not.toBeNull();
  });

  it("軌跡は動くギミックと一緒でないと選べない", () => {
    expect(gimmickConflict(get("trail"), [], defs)).toMatch(/一緒に使います/);
    const mover = get("trail").requiresAny[0];
    expect(gimmickConflict(get("trail"), sel(mover), defs)).toBeNull();
  });

  it("ぶつからない組み合わせは選べる", () => {
    expect(gimmickConflict(get("toggle-light"), sel("spin"), defs)).toBeNull();
  });
});

describe("選択の正規化（parseGimmickSelection）", () => {
  it("存在しない・重複したギミックは捨てる", () => {
    expect(parseGimmickSelection([{ slug: "spin" }, { slug: "spin" }, { slug: "nope" }], defs).map((g) => g.slug)).toEqual(["spin"]);
  });

  it("設定値は範囲と刻みに収め、足りない値は初期値で補う", () => {
    const [spin] = parseGimmickSelection([{ slug: "spin", params: { speed: 9999, axis: "bad" } }], defs);
    const speed = get("spin").params.find((p) => p.key === "speed")!;
    expect(spin.params.speed).toBe(speed.type === "number" ? speed.max : undefined);
    expect(spin.params.axis).toBe(get("spin").params.find((p) => p.key === "axis")!.default);
    const [rounded] = parseGimmickSelection([{ slug: "spin", params: { speed: 47 } }], defs);
    expect(rounded.params.speed).toBe(45);
  });

  it("ぶつかる組み合わせは、後から選んだほうを捨てる", () => {
    expect(parseGimmickSelection(sel("spin", "step-rotate"), defs).map((g) => g.slug)).toEqual(["spin"]);
  });

  it("依存先がなくなったギミックは捨てる", () => {
    expect(parseGimmickSelection(sel("trail"), defs)).toEqual([]);
  });

  it("配列でなければ空", () => {
    expect(parseGimmickSelection({ slug: "spin" }, defs)).toEqual([]);
    expect(parseGimmickSelection(null, defs)).toEqual([]);
  });
});
