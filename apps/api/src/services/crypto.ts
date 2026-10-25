// Field encryption (AES-256-GCM) for sensitive values such as bank account numbers,
// and HMAC signing for short-lived file links.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { config, decodeKey } from "../config.js";
import { safeEqual } from "../domain/otp.js";

const key = () => decodeKey(config().DATA_ENCRYPTION_KEY)!;

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(token: string): string {
  const [iv, tag, data] = token.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}

export function sign(value: string): string {
  return createHmac("sha256", config().FILE_URL_SECRET).update(value).digest("base64url");
}

export const verifySignature = (value: string, signature: string) => safeEqual(sign(value), signature);
