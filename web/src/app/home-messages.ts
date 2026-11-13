import { defineMessages } from "@/i18n/messages";

export const homeMessages = defineMessages({
  ja: {
    deleted: "退会が完了しました。ご利用ありがとうございました。",
    headline1: "画像を貼るだけで、",
    headline2: "VRChat に置ける3Dグッズに。",
    lead: "モデリングの知識は不要です。即売会のブースに、あなたのグッズのサンプルを並べましょう。",
    start: "さっそく作ってみる",
    myWorks: "マイ作品を見る",
    signup: "無料で登録（3トークン付き）",
    steps: [
      { title: "テンプレートを選ぶ", body: "ケーキなど、展示したいグッズの形を選びます。" },
      { title: "画像を貼って調整", body: "画像をアップロードして、大きさ・位置・色をブラウザ上で調整します。" },
      { title: "VRChat に置く", body: "unitypackage をダウンロードして、ワールドのブースに配置します。" },
    ],
    news: "お知らせ",
    allNews: "すべて見る",
    showcase: "作れるグッズの例",
    allTemplates: (n: number) => `${n} 種類のテンプレートをすべて見る`,
    stepsHeading: "作り方",
    tokenUnit: (() => "トークン") as (n: number) => string,
  },
  en: {
    deleted: "Your account has been deleted. Thank you for using VRPrintLab.",
    headline1: "Add your images and get",
    headline2: "3D merch you can place in VRChat.",
    lead: "You don't need to know 3D modeling. Make samples of your merch to put on display at your booth at VRChat events.",
    start: "Pick a template",
    myWorks: "View my works",
    signup: "Sign up free (3 tokens included)",
    steps: [
      { title: "Choose a template", body: "Pick the item you want to display, like a cake or a tapestry." },
      { title: "Add your images", body: "Upload your images, then adjust their size, position, and colors in your browser." },
      { title: "Place it in VRChat", body: "Download the unitypackage and drop it into your booth or world." },
    ],
    news: "News",
    allNews: "See all",
    showcase: "Examples of merch you can make",
    allTemplates: (n: number) => `See all ${n} templates`,
    stepsHeading: "How it works",
    tokenUnit: (n: number) => (n === 1 ? "token" : "tokens"),
  },
});
