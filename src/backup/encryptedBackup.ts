import { type BackupV2, validateBackup } from "../domain/models";

const ITERATIONS = 600_000;
const BACKUP_ERROR = "备份密码不正确或文件已损坏";

export type EncryptedBackup = {
  format: "aurora-backup";
  version: 1;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const deriveKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: ITERATIONS,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export function isEncryptedBackup(value: unknown): value is EncryptedBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<EncryptedBackup>;
  return (
    backup.format === "aurora-backup" &&
    backup.version === 1 &&
    backup.kdf === "PBKDF2-SHA-256" &&
    backup.iterations === ITERATIONS &&
    typeof backup.salt === "string" &&
    typeof backup.iv === "string" &&
    typeof backup.ciphertext === "string"
  );
}

export async function encryptBackup(
  backup: BackupV2,
  password: string,
): Promise<EncryptedBackup> {
  if (!password) throw new Error("请设置备份密码");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    format: "aurora-backup",
    version: 1,
    kdf: "PBKDF2-SHA-256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptBackup(
  encrypted: unknown,
  password: string,
): Promise<BackupV2> {
  try {
    if (!password || !isEncryptedBackup(encrypted)) throw new Error(BACKUP_ERROR);
    const salt = fromBase64(encrypted.salt);
    const iv = fromBase64(encrypted.iv);
    if (salt.byteLength !== 16 || iv.byteLength !== 12) throw new Error(BACKUP_ERROR);

    const key = await deriveKey(password, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      fromBase64(encrypted.ciphertext),
    );
    return validateBackup(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    throw new Error(BACKUP_ERROR);
  }
}

export function backupSummary(backup: BackupV2): string {
  return `包含 ${backup.conversations.length} 段对话、${backup.messages.length} 条消息、${backup.roles.length} 个角色和 ${backup.profiles.length} 个服务配置`;
}
