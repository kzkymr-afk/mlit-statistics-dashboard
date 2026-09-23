"use client";

import React from "react";
import {
  AUTH_STORAGE_KEY,
  buildSession,
  credentialHash,
  isSessionValid,
  verifyCredentials,
} from "@/lib/atlas-auth.mjs";

type GateState = "checking" | "locked" | "open";

/**
 * Atlasのログインゲート。
 *
 * 本文は常にレンダリングし（SSG/SSR出力とSEO・初期描画を維持）、
 * 未認証の間は不透明な全画面オーバーレイで覆う。認証状態はlocalStorageに
 * 有効期限つきで保持する。静的サイトのため公開データファイル自体の取得を
 * 禁止するものではない（画面ゲート）。
 */
export default function AtlasLoginGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<GateState>("checking");
  const [userId, setUserId] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      // localStorageはブラウザでしか読めないため、SSG出力と一致させたうえでマウント後に1回だけ反映する。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(isSessionValid(raw) ? "open" : "locked");
    } catch {
      setState("locked");
    }
  }, []);

  const submit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        const ok = await verifyCredentials(userId.trim(), password);
        if (!ok) {
          setError("IDまたはパスワードが違います。");
          return;
        }
        const hash = await credentialHash(userId.trim(), password);
        try {
          window.localStorage.setItem(AUTH_STORAGE_KEY, buildSession(hash));
        } catch {
          // storage不可（プライベートモード等）でもセッション中は開く
        }
        setPassword("");
        setState("open");
      } finally {
        setBusy(false);
      }
    },
    [busy, userId, password],
  );

  const logout = React.useCallback(() => {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // no-op
    }
    setUserId("");
    setPassword("");
    setState("locked");
  }, []);

  return (
    <>
      {children}
      {state !== "open" ? (
        <div className="atlas-gate" role="dialog" aria-modal="true" aria-label="ログイン">
          {state === "locked" ? (
            <form className="atlas-gate-card" onSubmit={submit}>
              <div className="atlas-gate-brand">
                <span>At</span>
                <div>
                  <strong>Atlas</strong>
                  <small>CONSTRUCTION DATA</small>
                </div>
              </div>
              <p>建設データアトラスへのアクセスにはログインが必要です。</p>
              <label>
                ID
                <input
                  type="text"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <label>
                パスワード
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              {error ? <p className="atlas-gate-error" role="alert">{error}</p> : null}
              <button type="submit" disabled={busy || !userId || !password}>
                {busy ? "確認中…" : "ログイン"}
              </button>
            </form>
          ) : null}
        </div>
      ) : (
        <button type="button" className="atlas-gate-logout" onClick={logout}>
          ログアウト
        </button>
      )}
    </>
  );
}
