const MAX_TRANSFER_BYTES = 20 * 1024 * 1024;
const TRANSFER_TTL_MS = 15 * 60 * 1000;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TRANSFER_PREFIX = "transfers/";
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789_-";
const ALLOWED_ORIGINS = new Set(["https://said1120.github.io", "http://localhost"]);

type R2Object = {
  body: ReadableStream;
  customMetadata?: Record<string, string>;
};

type R2ListResult = {
  objects: Array<{ key: string; customMetadata?: Record<string, string> }>;
  truncated?: boolean;
  cursor?: string;
};

export type Env = {
  TRANSFER_BUCKET: {
    put(key: string, value: string, options: { customMetadata: Record<string, string> }): Promise<unknown>;
    get(key: string): Promise<R2Object | null>;
    delete(key: string): Promise<unknown>;
    list(options: { prefix: string; cursor?: string }): Promise<R2ListResult>;
  };
  TURNSTILE_SECRET_KEY: string;
};

type TransferUpload = {
  version: 1;
  iv: string;
  ciphertext: string;
};

const isAllowedOrigin = (origin: string | null): origin is string =>
  origin !== null &&
  (ALLOWED_ORIGINS.has(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/u.test(origin));

const corsHeaders = (request: Request): Headers => {
  const headers = new Headers({ Vary: "Origin" });
  const origin = request.headers.get("origin");
  if (isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type, cf-turnstile-response");
  }
  return headers;
};

const response = (
  request: Request,
  body: BodyInit | null,
  status: number,
  headers: HeadersInit = {},
): Response => {
  const responseHeaders = corsHeaders(request);
  for (const [name, value] of new Headers(headers)) responseHeaders.set(name, value);
  return new Response(body, { status, headers: responseHeaders });
};

const json = (request: Request, value: unknown, status: number, headers: HeadersInit = {}): Response =>
  response(request, JSON.stringify(value), status, {
    "Content-Type": "application/json",
    ...headers,
  });

const decodeBase64Url = (value: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) return null;
  try {
    const binary = atob(
      value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "="),
    );
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

const decodedBase64UrlByteLength = (value: string): number | null => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) return null;
  const paddingLength = (4 - (value.length % 4)) % 4;
  return ((value.length + paddingLength) / 4) * 3 - paddingLength;
};

const parseUpload = (value: unknown): TransferUpload | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TransferUpload>;
  if (
    candidate.version !== 1 ||
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string"
  ) return null;

  const iv = decodeBase64Url(candidate.iv);
  const ciphertextByteLength = decodedBase64UrlByteLength(candidate.ciphertext);
  if (!iv || iv.byteLength !== 12 || !ciphertextByteLength) return null;
  return { version: 1, iv: candidate.iv, ciphertext: candidate.ciphertext };
};

const generateId = (): string => {
  let id = "";
  const randomBytes = new Uint8Array(32);
  while (id.length < 22) {
    crypto.getRandomValues(randomBytes);
    for (const byte of randomBytes) {
      if (byte >= 228) continue;
      id += ID_ALPHABET[byte % ID_ALPHABET.length];
      if (id.length === 22) return id;
    }
  }
  return id;
};

const validateTurnstile = async (token: string | null, env: Env): Promise<boolean> => {
  if (!token) return false;
  try {
    const result = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
    });
    if (!result.ok) return false;
    return (await result.json() as { success?: unknown }).success === true;
  } catch {
    return false;
  }
};

const createTransfer = async (request: Request, env: Env): Promise<Response> => {
  if (!(await validateTurnstile(request.headers.get("cf-turnstile-response"), env))) {
    return response(request, "Forbidden", 403);
  }

  let upload: TransferUpload | null;
  try {
    upload = parseUpload(await request.json());
  } catch {
    upload = null;
  }
  if (!upload) return response(request, "Invalid transfer envelope", 400);

  const ciphertextByteLength = decodedBase64UrlByteLength(upload.ciphertext);
  if (!ciphertextByteLength) return response(request, "Invalid transfer envelope", 400);
  if (ciphertextByteLength > MAX_TRANSFER_BYTES) {
    return response(request, "Transfer payload too large", 413);
  }

  const id = generateId();
  const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS).toISOString();
  await env.TRANSFER_BUCKET.put(`${TRANSFER_PREFIX}${id}`, JSON.stringify(upload), {
    customMetadata: { expiresAt },
  });
  return json(request, { id }, 201, { "Cache-Control": "no-store" });
};

const isExpired = (expiresAt: string | undefined, now = Date.now()): boolean => {
  if (!expiresAt) return true;
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now;
};

const claimTransfer = async (request: Request, env: Env, id: string): Promise<Response> => {
  if (!/^[a-z0-9_-]{22}$/u.test(id)) return response(request, "Gone", 410);

  const key = `${TRANSFER_PREFIX}${id}`;
  const object = await env.TRANSFER_BUCKET.get(key);
  if (!object) return response(request, "Gone", 410);
  if (isExpired(object.customMetadata?.expiresAt)) {
    await env.TRANSFER_BUCKET.delete(key);
    return response(request, "Gone", 410);
  }

  const upload = await new Response(object.body).text();
  await env.TRANSFER_BUCKET.delete(key);
  return response(request, upload, 200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
};

const deleteExpiredTransfers = async (env: Env): Promise<void> => {
  let cursor: string | undefined;
  do {
    const page = await env.TRANSFER_BUCKET.list({ prefix: TRANSFER_PREFIX, cursor });
    await Promise.all(
      page.objects
        .filter((object) => isExpired(object.customMetadata?.expiresAt))
        .map((object) => env.TRANSFER_BUCKET.delete(object.key)),
    );
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
};

export function createHandler(env: Env) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return isAllowedOrigin(request.headers.get("origin"))
          ? response(request, null, 204)
          : response(request, "Forbidden", 403);
      }
      if (request.method === "POST" && url.pathname === "/v1/transfers") return createTransfer(request, env);
      if (request.method === "GET" && url.pathname.startsWith("/v1/transfers/")) {
        return claimTransfer(request, env, url.pathname.slice("/v1/transfers/".length));
      }
      return response(request, "Not found", 404);
    },
    async scheduled(): Promise<void> {
      await deleteExpiredTransfers(env);
    },
  };
}

const worker = {
  fetch(request: Request, env: Env): Promise<Response> {
    return createHandler(env).fetch(request);
  },
  scheduled(_event: unknown, env: Env): Promise<void> {
    return createHandler(env).scheduled();
  },
};

export default worker;
