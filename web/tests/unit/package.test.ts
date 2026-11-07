import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { gimmickDefinitionSchema } from "@/lib/gimmicks/schema";
import { termsVersionLabel } from "@/lib/legal";
import { readUnityPackage, type UnityPackageEntry } from "@/lib/package/read-unitypackage";
import { buildUnityPackage, deterministicGuid, safeFileName, type PackageAsset } from "@/lib/package/unitypackage";
import { buildWorkPackage, packageFileName, packageFolderName, type WorkPackageInput } from "@/lib/package/work-package";
import { IMAGE_A, params, slots } from "../helpers/fixtures";

// ---- テスト用のテンプレート（Unity で書き出した unitypackage と同じ形） ----
const OLD_SEED = "template-author";
const T = "Assets/TestTemplate";
const oldGuid = (p: string) => deterministicGuid(OLD_SEED, p);
const meta = (guid: string) => `fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  mainObjectFileID: 0\n`;
const material = (name: string) => `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!21 &2100000
Material:
  serializedVersion: 8
  m_Name: ${name}
  m_Shader: {fileID: 46, guid: 0000000000000000f000000000000000, type: 0}
  m_ValidKeywords: []
  m_CustomRenderQueue: -1
  stringTagMap: {}
  m_SavedProperties:
    serializedVersion: 3
    m_TexEnvs:
    - _MainTex:
        m_Texture: {fileID: 0}
        m_Scale: {x: 2, y: 2}
        m_Offset: {x: 0.5, y: 0}
    m_Floats:
    - _Mode: 0
    m_Colors:
    - _Color: {r: 1, g: 1, b: 1, a: 1}
`;
const prefab = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!23 &1
MeshRenderer:
  m_Materials:
  - {fileID: 2100000, guid: ${oldGuid(`${T}/Mat_Base.mat`)}, type: 2}
  - {fileID: 2100000, guid: ${oldGuid(`${T}/Mat_Print.mat`)}, type: 2}
  - {fileID: 2100000, guid: ${oldGuid(`${T}/Mat_Sticker.mat`)}, type: 2}
`;
const templateAssets: PackageAsset[] = [
  { path: T, data: Buffer.alloc(0), meta, folder: true },
  { path: `${T}/Model.prefab`, data: Buffer.from(prefab), meta },
  { path: `${T}/Mat_Base.mat`, data: Buffer.from(material("Mat_Base")), meta },
  { path: `${T}/Mat_Print.mat`, data: Buffer.from(material("Mat_Print")), meta },
  { path: `${T}/Mat_Sticker.mat`, data: Buffer.from(material("Mat_Sticker")), meta },
  // 購入者のプロジェクトで勝手に動くコードは、テンプレートに入っていても取り除く
  { path: `${T}/Evil.cs`, data: Buffer.from("class Evil {}"), meta },
];
const templatePackage = buildUnityPackage(OLD_SEED, templateAssets);

const spin = gimmickDefinitionSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "gimmicks", "catalog", "spin.json"), "utf8")));
const PURCHASE = "33333333-3333-4333-8333-333333333333";
const OTHER_PURCHASE = "44444444-4444-4444-8444-444444444444";

let image: Buffer;
const input = (purchaseId = PURCHASE): WorkPackageInput => ({
  purchaseId,
  workName: "テスト作品",
  template: { slug: "test", name: "テスト", slots, prefabPath: `${T}/Model.prefab` },
  params: params({ color: "#123456" }),
  gimmicks: [{ def: spin, params: { speed: 90, axis: "1" } }],
  templatePackage,
  images: new Map([[IMAGE_A, image]]),
  createdAt: new Date("2026-11-03T12:00:00+09:00"),
});

let entries: UnityPackageEntry[];
const base = `Assets/VRPrintLab/${packageFolderName("テスト作品", PURCHASE)}`;
const find = (p: string) => entries.find((e) => e.path === p);
const text = (p: string) => find(p)?.asset?.toString("utf8") ?? "";

beforeAll(async () => {
  image = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 124, g: 58, b: 237, alpha: 1 } } }).png().toBuffer();
  entries = readUnityPackage(await buildWorkPackage(input()));
});

describe("作品のパッケージ", () => {
  it("作品フォルダに、テンプレート・テクスチャ・README・LICENSE・組み立て設定が入る", () => {
    for (const p of ["Template/Model.prefab", "Template/Mat_Print.mat", "Tex_print.png", "Tex_sticker.png", "README.txt", "LICENSE.txt", "VRPrintLab.json"]) {
      expect(find(`${base}/${p}`), p).toBeDefined();
    }
    expect(base).toBe("Assets/VRPrintLab/テスト作品_33333333");
  });

  it("テンプレートに入っていたスクリプトは取り除く", () => {
    expect(entries.some((e) => e.path.endsWith("Evil.cs"))).toBe(false);
  });

  it("共通スクリプトとギミックのスクリプトが入る", () => {
    expect(find("Assets/VRPrintLab/_Runtime/Scripts/VRPLSpin.cs")).toBeDefined();
    expect(entries.some((e) => e.path.startsWith("Assets/VRPrintLab/_Runtime/Editor/") && e.path.endsWith(".cs"))).toBe(true);
  });

  it("色のスロットのマテリアルに、選んだ色が入る", () => {
    expect(text(`${base}/Template/Mat_Base.mat`)).toContain("_Color: {r: 0.0706, g: 0.2039, b: 0.3373, a: 1}");
  });

  it("プリントのマテリアルにテクスチャが割り当てられ、タイリングは 1・オフセットは 0 になる", () => {
    const mat = text(`${base}/Template/Mat_Print.mat`);
    expect(mat).toContain(`m_Texture: {fileID: 2800000, guid: ${find(`${base}/Tex_print.png`)!.guid}, type: 3}`);
    expect(mat).toContain("m_Scale: {x: 1, y: 1}");
    expect(mat).toContain("m_Offset: {x: 0, y: 0}");
    expect(mat).toContain("_Color: {r: 1.0000, g: 1.0000, b: 1.0000, a: 1}");
  });

  it("背景が透明なプリント面は切り抜き（Cutout）にする", () => {
    const mat = text(`${base}/Template/Mat_Sticker.mat`);
    expect(mat).toContain("- _Mode: 1");
    expect(mat).toContain("_ALPHATEST_ON");
    expect(text(`${base}/Template/Mat_Print.mat`)).toContain("- _Mode: 0");
  });

  it("テクスチャは面の縦横比の PNG で、背景色のある面は不透明", async () => {
    const tex = await sharp(find(`${base}/Tex_print.png`)!.asset!).metadata();
    expect([tex.format, tex.width, tex.height]).toEqual(["png", 512, 256]);
    const corner = await sharp(find(`${base}/Tex_print.png`)!.asset!).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    expect([...corner]).toEqual([0x12, 0x34, 0x56, 255]);
  });

  it("Prefab からマテリアルへの参照を、新しい GUID に書き換える", () => {
    const pf = text(`${base}/Template/Model.prefab`);
    expect(pf).toContain(find(`${base}/Template/Mat_Base.mat`)!.guid);
    expect(pf).not.toContain(oldGuid(`${T}/Mat_Base.mat`));
  });

  it(".meta の guid は、パッケージ内の GUID と一致する", () => {
    for (const e of entries) expect(e.meta, e.path).toContain(`guid: ${e.guid}`);
  });

  it("組み立て設定に、ギミックと設定値が入る", () => {
    const config = JSON.parse(text(`${base}/VRPrintLab.json`));
    expect(JSON.stringify(config)).toContain("VRPLSpin");
    expect(JSON.stringify(config)).toContain("90");
  });
});

describe("README と LICENSE", () => {
  it("LICENSE に利用条件・取得 ID・規約の版と URL が入る", () => {
    const license = text(`${base}/LICENSE.txt`);
    expect(license).toContain(`取得 ID     : ${PURCHASE}`);
    expect(license).toContain(`規約の版    : ${termsVersionLabel()}`);
    expect(license).toMatch(/利用規約 {4}: https?:\/\/.+\/terms/);
    expect(license).toContain("BOOTH などで販売・無料配布できます");
    expect(license).toContain("再配布・再販売することはできません");
  });

  it("README に使い方と LICENSE への案内、ギミック、UdonSharp の注意が入る", () => {
    const readme = text(`${base}/README.txt`);
    expect(readme).toContain("テスト作品");
    expect(readme).toContain("LICENSE.txt");
    expect(readme).toContain(spin.name);
    expect(readme).toContain("UdonSharp");
  });
});

describe("GUID（再インポートで上書きされるように）", () => {
  it("同じ購入 ID なら毎回同じ GUID", async () => {
    const again = readUnityPackage(await buildWorkPackage(input()));
    expect(again.map((e) => `${e.path}:${e.guid}`)).toEqual(entries.map((e) => `${e.path}:${e.guid}`));
  });

  it("購入 ID が違えば作品の GUID は別、共通スクリプトの GUID は同じ", async () => {
    const other = readUnityPackage(await buildWorkPackage(input(OTHER_PURCHASE)));
    const guidOf = (list: UnityPackageEntry[], suffix: string) => list.find((e) => e.path.endsWith(suffix))!.guid;
    expect(guidOf(other, "/Template/Model.prefab")).not.toBe(guidOf(entries, "/Template/Model.prefab"));
    expect(guidOf(other, "_Runtime/Scripts/VRPLSpin.cs")).toBe(guidOf(entries, "_Runtime/Scripts/VRPLSpin.cs"));
  });
});

describe("ファイル名", () => {
  it("Windows で使えない文字を置き換え、空なら代わりの名前にする", () => {
    expect(safeFileName('a/b\\c:d*e?"f<g>h|i', "x")).not.toMatch(/[\\/:*?"<>|]/);
    expect(safeFileName("   ", "代わり")).toBe("代わり");
    expect(safeFileName("ケーキの作品", "x")).toBe("ケーキの作品");
  });

  it("ダウンロードのファイル名は ASCII だけにし、取得 ID で区別する", () => {
    expect(packageFileName("ケーキの作品", PURCHASE)).toBe("VRPrintLab_33333333.unitypackage");
    expect(packageFileName("My Cake", PURCHASE)).toBe("My Cake_33333333.unitypackage");
    expect(packageFileName("ケーキ Cake 作品", OTHER_PURCHASE)).toBe("Cake_44444444.unitypackage");
    expect(packageFileName('a/b:c', PURCHASE)).toBe("abc_33333333.unitypackage");
  });
});
