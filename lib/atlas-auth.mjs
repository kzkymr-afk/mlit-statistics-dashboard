// Atlasのログインゲート認証ロジック。
//
// 静的サイト（GitHub Pages）で動くクライアントサイド認証のため、
// 平文の資格情報はコードに置かず、salt付きSHA-256ハッシュのみを保持する。
// 注意: これは「画面を開けるかどうか」のゲートであり、公開データファイル
// （public/system/ 配下）自体の取得をサーバ側で禁止するものではない。
// サーバ側の本格的なアクセス制御が必要になった場合はCloudflare Access等を使う。

export const AUTH_SALT = "atlas-auth-v1";

// 許可された資格情報のハッシュ一覧（salt:id:password のSHA-256）。
// 現時点で kiyo0106 のみ。追加時はこの配列にハッシュを足す。
export const AUTHORIZED_HASHES = [
  "4b7837dc7716f33b39f25545b49cbb0746bc18fdc841c77c7bf8be2d0220f7f3",
];

export const AUTH_STORAGE_KEY = "atlas:auth-session:v1";
export const AUTH_SESSION_DAYS = 7;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** WebCrypto（ブラウザ）とnode:crypto（テスト）の両方で動くSHA-256 */
export async function sha256Hex(text) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return toHex(digest);
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text).digest("hex");
}

export async function credentialHash(id, password) {
  return sha256Hex(`${AUTH_SALT}:${String(id ?? "")}:${String(password ?? "")}`);
}

/** ID・パスワードの組が許可済みかを返す */
export async function verifyCredentials(id, password) {
  const hash = await credentialHash(id, password);
  return AUTHORIZED_HASHES.includes(hash);
}

/** ログイン成功時にstorageへ保存するセッション文字列を作る */
export function buildSession(hash, now = Date.now()) {
  const expiresAt = now + AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000;
  return JSON.stringify({ hash, expiresAt });
}

/** storageのセッション文字列が有効かを返す */
export function isSessionValid(raw, now = Date.now()) {
  if (typeof raw !== "string" || !raw) return false;
  try {
    const session = JSON.parse(raw);
    return (
      typeof session?.hash === "string" &&
      AUTHORIZED_HASHES.includes(session.hash) &&
      Number.isFinite(session?.expiresAt) &&
      session.expiresAt > now
    );
  } catch {
    return false;
  }
}
