import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function credentialKey() {
  const value = process.env.QAWELL_CREDENTIAL_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) {
    throw new Error("QAWELL_CREDENTIAL_ENCRYPTION_KEY must be 64 hexadecimal characters");
  }
  return Buffer.from(value, "hex");
}

export function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCredential(value: string) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", credentialKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
