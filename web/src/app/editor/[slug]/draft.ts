import type { GimmickSelection } from "@/lib/gimmicks/schema";
import type { EditorParams } from "@/lib/templates/params";

// ログイン前の編集内容を、ログイン画面から戻るまでブラウザ内（IndexedDB）に一時保存する。
// 画像は数MBになるため sessionStorage ではなく IndexedDB に Blob のまま入れる

export type Draft = {
  name: string;
  params: EditorParams;
  gimmicks?: GimmickSelection[];
  images: { id: string; file: File }[];
  savedAt: number;
};

const DB_NAME = "vrprintlab";
const STORE = "drafts";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const saveDraft = (slug: string, draft: Draft) => run("readwrite", (s) => s.put(draft, slug));

export async function takeDraft(slug: string): Promise<Draft | null> {
  try {
    const draft = (await run<Draft | undefined>("readonly", (s) => s.get(slug))) ?? null;
    await run("readwrite", (s) => s.delete(slug));
    if (!draft || Date.now() - draft.savedAt > MAX_AGE_MS) return null;
    return draft;
  } catch {
    return null;
  }
}
