import type { IncomingMessage, ServerResponse } from "node:http";

type FetchHandler = (req: Request) => Promise<Response>;

let _fetch: FetchHandler | null = null;

async function getServerFetch(): Promise<FetchHandler> {
  if (!_fetch) {
    const mod = await import("../dist/server/server.js");
    _fetch = mod.default.fetch.bind(mod.default);
  }
  return _fetch!;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const serverFetch = await getServerFetch();

  const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
  const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost";
  const url = new URL(req.url!, `${proto}://${host}`);

  const init: RequestInit & { duplex?: string } = {
    method: req.method ?? "GET",
    headers: req.headers as HeadersInit,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = new ReadableStream({
      start(controller) {
        req.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        req.on("end", () => controller.close());
        req.on("error", (err) => controller.error(err));
      },
    });
    init.duplex = "half";
  }

  const webResponse = await serverFetch(new Request(url.toString(), init));

  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => res.setHeader(key, value));

  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
  }

  res.end();
}
