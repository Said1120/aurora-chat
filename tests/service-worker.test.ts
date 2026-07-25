import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type FetchEvent = {
  request: {
    method: string;
    url: string;
    destination: string;
  };
  respondWith: ReturnType<typeof vi.fn>;
};

const loadFetchHandler = async () => {
  let fetchHandler: ((event: FetchEvent) => void) | undefined;
  const serviceWorker = await readFile(resolve(process.cwd(), "public/sw.js"), "utf8");
  const self = {
    location: { origin: "https://said1120.github.io" },
    addEventListener(type: string, handler: (event: FetchEvent) => void) {
      if (type === "fetch") fetchHandler = handler;
    },
    clients: { claim: vi.fn() },
  };

  vm.runInNewContext(serviceWorker, {
    self,
    caches: {
      open: vi.fn(async () => ({ addAll: vi.fn(), put: vi.fn() })),
      match: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    },
    fetch: vi.fn(async () => new Response("network")),
    Response,
    URL,
    Promise,
  });

  if (!fetchHandler) throw new Error("service worker did not register a fetch handler");
  return fetchHandler;
};

describe("service worker request boundary", () => {
  it("does not intercept cross-origin transfer claims or same-origin API fetches", async () => {
    const fetchHandler = await loadFetchHandler();
    const transferEvent: FetchEvent = {
      request: {
        method: "GET",
        url: "https://transfer.example/v1/transfers/one-time-id",
        destination: "",
      },
      respondWith: vi.fn(),
    };
    const apiEvent: FetchEvent = {
      request: {
        method: "GET",
        url: "https://said1120.github.io/aurora-chat/api/session",
        destination: "",
      },
      respondWith: vi.fn(),
    };

    fetchHandler(transferEvent);
    fetchHandler(apiEvent);

    expect(transferEvent.respondWith).not.toHaveBeenCalled();
    expect(apiEvent.respondWith).not.toHaveBeenCalled();
  });
});
