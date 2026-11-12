/**
 * 個人情報の暗号化（AES-256-GCM）と検索用ハッシュ（HMAC-SHA256）。サーバー専用。
 * 暗号文の形式: "v1:<iv base64>:<tag base64>:<ciphertext base64>"
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { config, dataMode } from "./config";

let warned = false;

function keyBytes(): Buffer {
  const raw = config.dataEncryptionKey;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY は 32 バイトを base64 にした値を設定してください");
    return buf;
  }
  if (dataMode() === "postgres" || process.env.NODE_ENV === "production") {
    throw new Error("DATA_ENCRYPTION_KEY が未設定です");
  }
  if (!warned) {
    warned = true;
    console.warn("[iwanaga-booking] DATA_ENCRYPTION_KEY 未設定のため開発用キーで暗号化しています（ローカル代替モード）");
  }
  return createHash("sha256").update("iwanaga-booking-local-dev-key").digest();
}

function pepper(): string {
  const p = config.hashPepper;
  if (p) return p;
  if (dataMode() === "postgres" || process.env.NODE_ENV === "production") throw new Error("HASH_PEPPER が未設定です");
  return "iwanaga-booking-local-dev-pepper";
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function decrypt(enc: string | null | undefined): string {
  if (!enc) return "";
  const [v, iv, tag, ct] = enc.split(":");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("unknown ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

/** 検索・照合用のハッシュ（元の値には戻せない） */
export function lookupHash(purpose: string, value: string): string {
  return createHmac("sha256", pepper()).update(`${purpose}:${value}`).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 紛らわしい 0/O/1/I を除く

/** 予約番号 IW-XXXXXX */
export function generateReservationCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `IW-${s}`;
}

/** LINE送信用の確認コード（6桁数字） */
export function generateVerifyCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 予約状況ページを見るためのトークン（URLに付ける） */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function newId(): string {
  return crypto.randomUUID();
}
