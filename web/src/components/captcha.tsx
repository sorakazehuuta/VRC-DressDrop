"use client";

import { useEffect, useRef, useState } from "react";
import { authMessages } from "@/app/auth/messages";
import { useLocale, useMessages } from "@/i18n/client";

// Cloudflare Turnstile。トークンは Supabase Auth が検証する（ダッシュボードの Attack Protection で CAPTCHA を有効にする）
// サイトキーが未設定なら何も出さない（開発中に CAPTCHA を使わない場合）
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loader: Promise<Turnstile> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loader ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      loader = null;
      script.remove();
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

// フォームに captchaToken を入れる。トークンは 1 回しか使えないので、送信の結果（resetSignal）が変わるたびに取り直す
// ready が false の間は送信ボタンを押せないようにする
export function useCaptcha(resetSignal: unknown) {
  // どの送信結果のあとに受け取ったトークンかを一緒に持つ（取り直す前の使用済みのトークンで送れないように）
  const [token, setToken] = useState<{ value: string; signal: unknown }>({ value: "", signal: null });
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const signalRef = useRef<unknown>(resetSignal);
  const m = useMessages(authMessages).captcha;
  const locale = useLocale();

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;
    const el = containerRef.current;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetRef.current = turnstile.render(el, {
          sitekey: SITE_KEY,
          language: locale,
          callback: (value: string) => {
            setToken({ value, signal: signalRef.current });
            setFailed(false);
          },
          "expired-callback": () => setToken({ value: "", signal: null }),
          "error-callback": () => {
            setToken({ value: "", signal: null });
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetRef.current) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (signalRef.current === resetSignal) return;
    signalRef.current = resetSignal;
    if (widgetRef.current) window.turnstile?.reset(widgetRef.current);
  }, [resetSignal]);

  const current = token.signal === resetSignal ? token.value : "";

  const field = SITE_KEY ? (
    <div className="flex flex-col gap-1.5">
      <div ref={containerRef} className="min-h-[65px]" />
      <input type="hidden" name="captchaToken" value={current} />
      {failed && (
        <p className="text-xs text-red-700">
          {m.failedToLoad}
        </p>
      )}
    </div>
  ) : null;

  return { field, ready: !SITE_KEY || current !== "" };
}
