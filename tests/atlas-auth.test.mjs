import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTHORIZED_HASHES,
  buildSession,
  credentialHash,
  isSessionValid,
  verifyCredentials,
} from "../lib/atlas-auth.mjs";

test("許可された資格情報のハッシュが登録済みハッシュと一致する", async () => {
  // 平文はテストにも置かない: ハッシュ関数の決定性と登録件数のみ検証する
  const hash = await credentialHash("dummy-id", "dummy-pass");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(AUTHORIZED_HASHES.length, 1);
  assert.match(AUTHORIZED_HASHES[0], /^[0-9a-f]{64}$/);
});

test("未登録の資格情報は拒否される", async () => {
  assert.equal(await verifyCredentials("guest", "guest"), false);
  assert.equal(await verifyCredentials("", ""), false);
  assert.equal(await verifyCredentials("kiyo0106", "wrong-password"), false);
});

test("credentialHashは入力が異なれば異なる値になる", async () => {
  const a = await credentialHash("user", "pass1");
  const b = await credentialHash("user", "pass2");
  const c = await credentialHash("user2", "pass1");
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("セッションの有効期限と改竄を検証する", () => {
  const now = Date.now();
  const valid = buildSession(AUTHORIZED_HASHES[0], now);
  assert.equal(isSessionValid(valid, now), true);
  // 期限切れ
  assert.equal(isSessionValid(valid, now + 8 * 24 * 60 * 60 * 1000), false);
  // 未登録ハッシュのセッションは無効
  const forged = buildSession("f".repeat(64), now);
  assert.equal(isSessionValid(forged, now), false);
  // 壊れた値
  assert.equal(isSessionValid("not-json", now), false);
  assert.equal(isSessionValid("", now), false);
  assert.equal(isSessionValid(null, now), false);
});
