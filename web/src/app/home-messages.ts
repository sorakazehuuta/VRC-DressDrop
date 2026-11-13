import { defineMessages } from "@/i18n/messages";

export const homeMessages = defineMessages({
  ja: {
    deleted: "退会が完了しました。ご利用ありがとうございました。",
    // 見出しは語句ごとに折り返す（狭い画面で「VRChatに／置ける」のように切れないように）
    headline: ["画像を貼るだけで、", "VRChatに置ける", "3Dグッズに。"],
    tryTitle: "画像を1枚アップして3Dプレビューを試す（無料）",
    upload: "アップロード",
    opening: "開いています…",
    dropHint: "ここに画像をドロップしても使えます",
    sampleAlt: "アップロードする画像の例（イラスト）",
    goodsAlt: "同じイラストを貼ったアクリルスタンド・マグカップ・缶バッジ・ケーキ",
    openError: "エディタを開けませんでした。もう一度お試しください。",
    steps: [
      { title: "テンプレートを選ぶ", body: "ケーキなど、展示したいグッズの形を選びます。" },
      { title: "画像を貼って調整", body: "画像をアップロードして、大きさ・位置・色をブラウザ上で調整します。" },
      { title: "VRChat に置く", body: "unitypackage をダウンロードして、ワールドのブースに配置します。" },
    ],
    news: "お知らせ",
    allNews: "すべて見る",
    allTemplates: (n: number) => `${n} 種類のテンプレートをすべて見る`,
    stepsHeading: "作り方",
  },
  en: {
    deleted: "Your account has been deleted. Thank you for using VRPrintLab.",
    headline: ["Add an image and get", "3D merch you can place in VRChat."],
    tryTitle: "Upload one image and try the 3D preview (free)",
    upload: "Upload",
    opening: "Opening…",
    dropHint: "You can also drop an image here",
    sampleAlt: "Example of an image to upload (an illustration)",
    goodsAlt: "An acrylic stand, mug, button badge, and cake with the same illustration",
    openError: "We couldn't open the editor. Please try again.",
    steps: [
      { title: "Choose a template", body: "Pick the item you want to display, like a cake or a tapestry." },
      { title: "Add your images", body: "Upload your images, then adjust their size, position, and colors in your browser." },
      { title: "Place it in VRChat", body: "Download the unitypackage and drop it into your booth or world." },
    ],
    news: "News",
    allNews: "See all",
    allTemplates: (n: number) => `See all ${n} templates`,
    stepsHeading: "How it works",
  },
});
