import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as worker from "../src/index";
import { type Env } from "../src/index";

const upload = {
  version: 1 as const,
  iv: "MTIzNDU2Nzg5MDEy",
  ciphertext: "c2VjcmV0",
};

type StoredObject = {
  body: string;
  customMetadata: Record<string, string>;
};

class MemoryBucket {
  readonly objects = new Map<string, StoredObject>();

  async put(
    key: string,
    body: string,
    options: { customMetadata?: Record<string, string> } = {},
  ): Promise<void> {
    this.objects.set(key, { body, customMetadata: options.customMetadata ?? {} });
  }

  async get(key: string): Promise<{ body: ReadableStream; customMetadata: Record<string, string> } | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      body: new Blob([object.body]).stream(),
      customMetadata: object.customMetadata,
    };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async list(options: { prefix?: string } = {}): Promise<{ objects: Array<{ key: string; customMetadata: Record<string, string> }> }> {
    return {
      objects: [...this.objects.entries()]
        .filter(([key]) => !options.prefix || key.startsWith(options.prefix))
        .map(([key, object]) => ({ key, customMetadata: object.customMetadata })),
    };
  }
}

class ConcurrentClaimBucket extends MemoryBucket {
  override async get(key: string): Promise<{ body: ReadableStream; customMetadata: Record<string, string> } | null> {
    const object = await super.get(key);
    if (!object || !key.startsWith("transfers/")) return object;
    await Promise.resolve();
    return object;
  }
}

type TransferClaimGateConstructor = new (state: unknown, env: Env) => {
  fetch(request: Request): Promise<Response>;
};

class MemoryClaimGateNamespace {
  private readonly gates = new Map<string, { fetch(request: Request): Promise<Response> }>();

  constructor(private readonly env: Env) {}

  idFromName(name: string): string {
    return name;
  }

  get(id: string): { fetch(request: Request): Promise<Response> } {
    let gate = this.gates.get(id);
    if (!gate) {
      const Gate = (worker as unknown as { TransferClaimGate: TransferClaimGateConstructor }).TransferClaimGate;
      gate = new Gate({}, this.env);
      this.gates.set(id, gate);
    }
    return gate;
  }
}

const createTestHandler = (bucket: MemoryBucket, turnstileSuccess = true) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ success: turnstileSuccess }),
    ),
  );
  const env = {
    TRANSFER_BUCKET: bucket,
    TURNSTILE_SECRET_KEY: "turnstile-secret",
  } as unknown as Env;
  return worker.createHandler({
    ...env,
    TRANSFER_CLAIM_GATE: new MemoryClaimGateNamespace(env),
  } as unknown as Env);
};

const createRequest = (body: unknown, origin?: string) =>
  new Request("https://worker.example/v1/transfers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-turnstile-response": "valid",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });

const createUpload = async (
  handler: ReturnType<typeof worker.createHandler>,
  body: unknown = upload,
): Promise<string> => {
  const response = await handler.fetch(createRequest(body));
  expect(response.status).toBe(201);
  return (await response.json() as { id: string }).id;
};

describe("one-time encrypted transfer worker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stores ciphertext only after successful Turnstile validation and returns a random ID", async () => {
    const bucket = new MemoryBucket();
    const handler = createTestHandler(bucket);

    const response = await handler.fetch(createRequest(upload));

    expect(response.status).toBe(201);
    const { id } = await response.json() as { id: string };
    expect(id).toMatch(/^[a-z0-9_-]{22}$/);
    expect(bucket.objects.get(`transfers/${id}`)?.body).toBe(JSON.stringify(upload));
  });

  it("rejects an upload when Turnstile validation fails without writing ciphertext", async () => {
    const bucket = new MemoryBucket();
    const handler = createTestHandler(bucket, false);

    const response = await handler.fetch(createRequest(upload));

    expect(response.status).toBe(403);
    expect(bucket.objects).toHaveLength(0);
  });

  it("rejects malformed envelopes and serialized envelopes over 20MB before writing", async () => {
    const bucket = new MemoryBucket();
    const handler = createTestHandler(bucket);
    const envelopeTooLargeCiphertext = Buffer.alloc(16 * 1024 * 1024).toString("base64url");

    expect((await handler.fetch(createRequest({ version: 1, iv: "bad", ciphertext: "not valid!" }))).status).toBe(400);
    expect((await handler.fetch(createRequest({ ...upload, ciphertext: envelopeTooLargeCiphertext }))).status).toBe(413);
    expect(bucket.objects).toHaveLength(0);
  });

  it("allows CORS only for GitHub Pages and local development", async () => {
    const bucket = new MemoryBucket();
    const handler = createTestHandler(bucket);

    const github = await handler.fetch(createRequest(upload, "https://said1120.github.io"));
    const local = await handler.fetch(createRequest(upload, "http://localhost:3000"));
    const untrusted = await handler.fetch(createRequest(upload, "https://example.com"));

    expect(github.headers.get("access-control-allow-origin")).toBe("https://said1120.github.io");
    expect(local.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(untrusted.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("deletes an item before responding to its claim and rejects the second claim", async () => {
    const bucket = new MemoryBucket();
    const handler = createTestHandler(bucket);
    const id = await createUpload(handler);
    const request = () => new Request(`https://worker.example/v1/transfers/${id}`);

    const first = await handler.fetch(request());
    const second = await handler.fetch(request());

    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toEqual(upload);
    expect(second.status).toBe(410);
  });

  it("allows exactly one successful response when two claims arrive concurrently", async () => {
    const bucket = new ConcurrentClaimBucket();
    const env = {
      TRANSFER_BUCKET: bucket,
      TURNSTILE_SECRET_KEY: "turnstile-secret",
    } as unknown as Env;
    const namespace = new MemoryClaimGateNamespace(env);
    const handler = worker.createHandler({
      ...env,
      TRANSFER_CLAIM_GATE: namespace,
    } as unknown as Env);
    const id = "concurrent_claim_test_";
    await bucket.put(`transfers/${id}`, JSON.stringify(upload), {
      customMetadata: { expiresAt: "2099-01-01T00:00:00.000Z" },
    });
    const claim = () => handler.fetch(new Request(`https://worker.example/v1/transfers/${id}`));

    const responses = await Promise.all([claim(), claim()]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 410)).toHaveLength(1);
  });

  it("rejects expired transfers and scheduled cleanup removes their ciphertext", async () => {
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
    const bucket = new MemoryBucket();
    await bucket.put("transfers/expired", JSON.stringify(upload), {
      customMetadata: { expiresAt: "2026-07-25T11:59:59.000Z" },
    });
    await bucket.put("transfers/future", JSON.stringify(upload), {
      customMetadata: { expiresAt: "2026-07-25T12:15:00.000Z" },
    });
    const handler = createTestHandler(bucket);

    const response = await handler.fetch(new Request("https://worker.example/v1/transfers/expired"));
    await handler.scheduled();

    expect(response.status).toBe(410);
    expect(bucket.objects.has("transfers/expired")).toBe(false);
    expect(bucket.objects.has("transfers/future")).toBe(true);
  });
});
