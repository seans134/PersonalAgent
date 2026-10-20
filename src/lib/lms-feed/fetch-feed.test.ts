import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { fetchLmsFeed, isBlockedAddress, LmsFeedFetchError, type FetchLmsFeedOptions, type ResolvedAddress } from "./fetch-feed";

const FEED = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
const SECRET_URL = "https://canvas.example.edu/feeds/calendars/user_SECRETTOKEN123.ics";

type FakeResponse = { status: number; headers?: Record<string, string>; body?: Buffer | string; chunks?: number };

/**
 * A stand-in for https.request: runs the lookup the real socket would (so pinning is exercised),
 * then answers from `routes` by host + path.
 */
function fakeNetwork(routes: Record<string, FakeResponse>, dnsTable: Record<string, string[]>) {
  const requested: string[] = [];
  const resolve = async (host: string): Promise<ResolvedAddress[]> => {
    const addresses = dnsTable[host];
    if (!addresses) throw new Error("ENOTFOUND");
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  const request = ((options: RequestOptions, callback: (response: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    req.destroy = () => undefined;
    req.end = () => {
      const key = `${options.hostname}${options.path}`;
      requested.push(key);
      const lookup = options.lookup as unknown as (
        host: string,
        opts: { all: boolean },
        cb: (error: Error | null, addresses?: ResolvedAddress[]) => void,
      ) => void;
      lookup(String(options.hostname), { all: true }, (error) => {
        if (error) {
          req.emit("error", error);
          return;
        }
        const route = routes[key];
        if (!route) {
          req.emit("error", new Error(`connect ECONNREFUSED for ${SECRET_URL}`));
          return;
        }
        const response = Object.assign(new PassThrough(), { statusCode: route.status, headers: route.headers ?? {} });
        callback(response);
        const body = typeof route.body === "string" ? Buffer.from(route.body) : route.body ?? Buffer.alloc(0);
        const pieces = route.chunks ?? 1;
        const size = Math.ceil(body.length / pieces) || 1;
        for (let i = 0; i < body.length; i += size) response.write(body.subarray(i, i + size));
        response.end();
      });
    };
    return req;
  }) as unknown as NonNullable<FetchLmsFeedOptions["request"]>;
  return { resolve, request, requested };
}

const publicDns = { "canvas.example.edu": ["93.184.216.34"], "cdn.example.edu": ["2606:4700::6810:84e5"] };

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    expect(error).toBeInstanceOf(LmsFeedFetchError);
    expect((error as Error).message).not.toContain("SECRETTOKEN");
    return (error as LmsFeedFetchError).code;
  }
}

describe("isBlockedAddress", () => {
  it("blocks private, loopback, link-local, metadata, CGNAT, multicast and reserved IPv4", () => {
    for (const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  it("blocks loopback, unique-local, link-local and IPv4-embedding IPv6", () => {
    for (const address of [
      "::",
      "::1",
      "fd00:ec2::254",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:169.254.169.254",
      "64:ff9b::10.0.0.1",
      "2002:7f00:1::",
    ]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  it("allows public addresses and refuses non-addresses", () => {
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("172.32.0.1")).toBe(false);
    expect(isBlockedAddress("2606:4700::6810:84e5")).toBe(false);
    expect(isBlockedAddress("::ffff:93.184.216.34")).toBe(false);
    expect(isBlockedAddress("canvas.example.edu")).toBe(true);
  });
});

describe("fetchLmsFeed", () => {
  it("fetches a public https feed and rewrites webcal://", async () => {
    const net = fakeNetwork({ "canvas.example.edu/feeds/a.ics": { status: 200, body: FEED } }, publicDns);
    await expect(fetchLmsFeed("webcal://canvas.example.edu/feeds/a.ics", net)).resolves.toBe(FEED);
    expect(net.requested).toEqual(["canvas.example.edu/feeds/a.ics"]);
  });

  it("refuses http, other ports and credentials before connecting", async () => {
    const net = fakeNetwork({}, publicDns);
    expect(await codeOf(fetchLmsFeed("http://canvas.example.edu/a.ics", net))).toBe("invalid_url");
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu:8080/a.ics", net))).toBe("invalid_url");
    expect(await codeOf(fetchLmsFeed("https://u:p@canvas.example.edu/a.ics", net))).toBe("invalid_url");
    expect(net.requested).toEqual([]);
  });

  it("refuses hosts that resolve to private or metadata addresses, and IP literals", async () => {
    const net = fakeNetwork({}, { "evil.example.com": ["93.184.216.34", "169.254.169.254"], "local.example.com": ["127.0.0.1"] });
    expect(await codeOf(fetchLmsFeed("https://evil.example.com/a.ics", net))).toBe("blocked_address");
    expect(await codeOf(fetchLmsFeed("https://local.example.com/a.ics", net))).toBe("blocked_address");
    expect(await codeOf(fetchLmsFeed("https://10.0.0.5/a.ics", net))).toBe("blocked_address");
    expect(await codeOf(fetchLmsFeed("https://169.254.169.254/latest/meta-data", net))).toBe("blocked_address");
    expect(net.requested).toEqual([]);
  });

  it("re-checks DNS at connect time (rebinding)", async () => {
    let calls = 0;
    const net = fakeNetwork({ "rebind.example.com/a.ics": { status: 200, body: FEED } }, {});
    const resolve = async (): Promise<ResolvedAddress[]> => {
      calls += 1;
      return [{ address: calls === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }];
    };
    expect(await codeOf(fetchLmsFeed("https://rebind.example.com/a.ics", { ...net, resolve }))).toBe("blocked_address");
  });

  it("follows redirects, re-checking each hop, up to the limit", async () => {
    const ok = fakeNetwork(
      {
        "canvas.example.edu/a.ics": { status: 302, headers: { location: "https://cdn.example.edu/b.ics" } },
        "cdn.example.edu/b.ics": { status: 200, body: FEED },
      },
      publicDns,
    );
    await expect(fetchLmsFeed("https://canvas.example.edu/a.ics", ok)).resolves.toBe(FEED);

    const toPrivate = fakeNetwork(
      { "canvas.example.edu/a.ics": { status: 301, headers: { location: "https://internal.example.edu/x" } } },
      { ...publicDns, "internal.example.edu": ["10.0.0.8"] },
    );
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/a.ics", toPrivate))).toBe("blocked_address");

    const toHttp = fakeNetwork(
      { "canvas.example.edu/a.ics": { status: 302, headers: { location: "http://canvas.example.edu/a.ics" } } },
      publicDns,
    );
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/a.ics", toHttp))).toBe("invalid_url");

    const loop = fakeNetwork(
      { "canvas.example.edu/a.ics": { status: 302, headers: { location: "/a.ics" } } },
      publicDns,
    );
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/a.ics", loop))).toBe("too_many_redirects");
    expect(loop.requested).toHaveLength(4);
  });

  it("caps the body, including after decompression and without a content-length", async () => {
    const declared = fakeNetwork(
      { "canvas.example.edu/a.ics": { status: 200, headers: { "content-length": "999999" }, body: FEED } },
      publicDns,
    );
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/a.ics", { ...declared, maxBytes: 1000 }))).toBe("too_large");

    const streamed = fakeNetwork({ "canvas.example.edu/a.ics": { status: 200, body: "x".repeat(5000), chunks: 10 } }, publicDns);
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/a.ics", { ...streamed, maxBytes: 1000 }))).toBe("too_large");

    const bomb = fakeNetwork(
      { "canvas.example.edu/a.ics": { status: 200, headers: { "content-encoding": "gzip" }, body: zlib.gzipSync("x".repeat(100_000)) } },
      publicDns,
    );
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/a.ics", { ...bomb, maxBytes: 1000 }))).toBe("too_large");

    const gzipped = fakeNetwork(
      { "canvas.example.edu/a.ics": { status: 200, headers: { "content-encoding": "gzip" }, body: zlib.gzipSync(FEED) } },
      publicDns,
    );
    await expect(fetchLmsFeed("https://canvas.example.edu/a.ics", gzipped)).resolves.toBe(FEED);
  });

  it("maps HTTP and network failures to codes without the link", async () => {
    const net = fakeNetwork(
      {
        "canvas.example.edu/gone.ics": { status: 404 },
        "canvas.example.edu/oops.ics": { status: 503 },
      },
      publicDns,
    );
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/gone.ics", net))).toBe("rejected");
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/oops.ics", net))).toBe("http_error");
    expect(await codeOf(fetchLmsFeed(SECRET_URL, net))).toBe("unreachable");
    expect(await codeOf(fetchLmsFeed("https://nowhere.example.edu/a.ics", net))).toBe("unreachable");
  });

  it("counts DNS toward the timeout", async () => {
    const net = fakeNetwork({ "canvas.example.edu/a.ics": { status: 200, body: FEED } }, publicDns);
    const slowDns = () => new Promise<ResolvedAddress[]>(() => undefined);
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/a.ics", { ...net, resolve: slowDns, timeoutMs: 20 }))).toBe("timeout");
    expect(net.requested).toEqual([]);
  });

  it("blocks IPv4-compatible, SIIT, local NAT64 and site-local IPv6", () => {
    for (const address of ["::7f00:1", "::ffff:0:a00:1", "64:ff9b:1::a00:1", "fec0::1"]) expect(isBlockedAddress(address)).toBe(true);
  });

  it("times out", async () => {
    const net = fakeNetwork({}, publicDns);
    const hang = ((options: RequestOptions) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
      req.end = () => undefined;
      req.destroy = () => undefined;
      void options;
      return req;
    }) as unknown as NonNullable<FetchLmsFeedOptions["request"]>;
    expect(await codeOf(fetchLmsFeed("https://canvas.example.edu/a.ics", { ...net, request: hang, timeoutMs: 20 }))).toBe("timeout");
  });
});
