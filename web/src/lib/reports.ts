// 通報の種類（reports.category）
export const reportCategories = {
  copyright: "著作権・商標権の侵害（無断転載など）",
  portrait: "肖像権・プライバシーの侵害",
  inappropriate: "わいせつ・暴力的・差別的など不適切な内容",
  redistribution: "テンプレートやパッケージの無断の再配布・再販売",
  other: "その他",
} as const;

export type ReportCategory = keyof typeof reportCategories;

export const reportStatusLabels: Record<string, string> = { open: "未対応", resolved: "対応済み", dismissed: "対応なし" };
