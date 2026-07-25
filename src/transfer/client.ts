import { type BackupV2, validateBackup } from "../domain/models";

export const MAX_TRANSFER_BYTES = 20 * 1024 * 1024;
const TRANSFER_ERROR = "迁移数据无法解密或已损坏";

export type TransferUpload = {
  version: 1;
  iv: string;
  ciphertext: string;
};

export type TransferPayload = {
  upload: TransferUpload;
  secret: string;
};

type FetchLike = typeof fetch;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis
    .btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
};

const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  return Uint8Array.from(globalThis.atob(padded), (character) => character.charCodeAt(0));
};

const toCryptoBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(bytes);

const importSecret = (secret: string, usage: KeyUsage[]): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    toCryptoBytes(fromBase64Url(secret)),
    { name: "AES-GCM" },
    false,
    usage,
  );

export function isTransferUpload(value: unknown): value is TransferUpload {
  if (!value || typeof value !== "object") return false;
  const upload = value as Partial<TransferUpload>;
  return (
    upload.version === 1 &&
    typeof upload.iv === "string" &&
    typeof upload.ciphertext === "string"
  );
}

export async function createTransferPayload(backup: BackupV2): Promise<TransferPayload> {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedSecret = toBase64Url(secret);
  const key = await importSecret(encodedSecret, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(backup));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toCryptoBytes(iv) },
    key,
    toCryptoBytes(plaintext),
  );

  return {
    secret: encodedSecret,
    upload: {
      version: 1,
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    },
  };
}

export async function openTransferPayload(
  upload: unknown,
  secret: string,
): Promise<BackupV2> {
  try {
    if (!isTransferUpload(upload)) throw new Error(TRANSFER_ERROR);
    const keyBytes = fromBase64Url(secret);
    const iv = fromBase64Url(upload.iv);
    if (keyBytes.byteLength !== 32 || iv.byteLength !== 12) throw new Error(TRANSFER_ERROR);
    const key = await importSecret(secret, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toCryptoBytes(iv) },
      key,
      toCryptoBytes(fromBase64Url(upload.ciphertext)),
    );
    return validateBackup(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    throw new Error(TRANSFER_ERROR);
  }
}

export async function createTransfer(
  serviceUrl: string,
  turnstileToken: string,
  upload: TransferUpload,
  fetcher: FetchLike = fetch,
): Promise<string> {
  const serialized = JSON.stringify(upload);
  if (new Blob([serialized], { type: "application/json" }).size > MAX_TRANSFER_BYTES) {
    throw new Error("迁移包超过 20MB 上限");
  }
  const response = await fetcher(`${serviceUrl.replace(/\/$/u, "")}/v1/transfers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-turnstile-response": turnstileToken,
    },
    body: serialized,
  });
  if (!response.ok) throw new Error(`迁移码创建失败（${response.status}）`);
  const result = (await response.json()) as { id?: unknown };
  if (typeof result.id !== "string" || !result.id) throw new Error("迁移码创建失败");
  return result.id;
}

export async function claimTransfer(
  serviceUrl: string,
  id: string,
  fetcher: FetchLike = fetch,
): Promise<TransferUpload> {
  const response = await fetcher(
    `${serviceUrl.replace(/\/$/u, "")}/v1/transfers/${encodeURIComponent(id)}`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error("迁移码无效、已领取或已过期");
  const upload = (await response.json()) as unknown;
  if (!isTransferUpload(upload)) throw new Error("迁移服务返回了无效数据");
  return upload;
}

export function createTransferLink(appUrl: string, id: string, secret: string): string {
  const url = new URL(appUrl);
  url.searchParams.set("transfer", id);
  return `${url.toString()}#key=${encodeURIComponent(secret)}`;
}

export function parseTransferLink(value: string): { id: string; secret: string } | null {
  try {
    const url = new URL(value);
    const id = url.searchParams.get("transfer");
    const secret = new URLSearchParams(url.hash.slice(1)).get("key");
    return id && secret ? { id, secret } : null;
  } catch {
    return null;
  }
}
