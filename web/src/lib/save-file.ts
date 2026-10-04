// Supabase の署名付き URL は日本語のファイル名を二重にエンコードして返すため、
// いったんブラウザで受け取り、ファイル名を指定して保存させる
export async function saveFileFromUrl(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blobUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    // 受け取りに失敗したら、ファイル名は崩れるが直接ダウンロードさせる
    window.location.href = url;
  }
}
