import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VRPrintLab",
    short_name: "VRPrintLab",
    description: "画像を貼るだけで、VRChatに置ける展示用3Dモデルを作れるWebサービス",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#031e42",
    icons: [
      { src: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
