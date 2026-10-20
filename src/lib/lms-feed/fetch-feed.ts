import dns from "node:dns";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import net from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";
import { lmsFeedErrorMessage, normalizeLmsFeedUrl, type LmsFeedErrorCode } from "@personal-agent/core/lms-feed";

// Server-side fetch of a student's LMS calendar feed, hardened against SSRF:
// - https only (webcal:// is rewritten by normalizeLmsFeedUrl), default port, no credentials;
// - every host is resolved and refused if ANY address is private, loopback, link-local (cloud
//   metadata), CGNAT, multicast or reserved, and the connection is pinned to the checked address
//   through `lookup` so a second DNS answer (rebinding) can't swap it;
// - redirects are followed by hand (at most LMS_FEED_MAX_REDIRECTS), each hop re-checked;
// - the body is capped at LMS_FEED_MAX_BYTES after decompression and the whole fetch at a timeout.
// Errors are LmsFeedFetchError with a fixed code and copy; the link is never part of a message.

export const LMS_FEED_MAX_BYTES = 5 * 1024 * 1024;
export const LMS_FEED_TIMEOUT_MS = 10_000;
export const LMS_FEED_MAX_REDIRECTS = 3;

export class LmsFeedFetchError extends Error {
  constructor(readonly code: LmsFeedErrorCode) {
    super(lmsFeedErrorMessage(code));
    this.name = "LmsFeedFetchError";
  }
}

const blockedV4 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including 169.254.169.254 cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved and broadcast
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}

const blockedV6 = new net.BlockList();
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::", 96], // IPv4-compatible (deprecated; ::7f00:1 is ::127.0.0.1)
  ["::ffff:0:0:0", 96], // IPv4-translated (SIIT)
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 32], // Teredo (embeds an IPv4 address)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds an IPv4 address)
  ["fc00::", 7], // unique local, including fd00:ec2::254 metadata
  ["fe80::", 10], // link-local
  ["fec0::", 10], // deprecated site-local
  ["ff00::", 8], // multicast
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

/** IPv4 embedded in an IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible or NAT64 (64:ff9b::/96) address. */
function embeddedIPv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = /^(?:::ffff:|::|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return null;
}

/** True for any address a feed must not be fetched from. Unparseable input counts as blocked. */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blockedV4.check(address, "ipv4");
  if (family === 6) {
    const v4 = embeddedIPv4(address);
    if (v4) return net.isIP(v4) !== 4 || blockedV4.check(v4, "ipv4");
    return blockedV6.check(address, "ipv6");
  }
  return true;
}

export type ResolvedAddress = { address: string; family: number };
type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

const systemResolver: Resolver = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/** Resolves a host and refuses it when any answer is a blocked address. */
async function resolvePublic(hostname: string, resolve: Resolver): Promise<ResolvedAddress[]> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bare)) {
    if (isBlockedAddress(bare)) throw new LmsFeedFetchError("blocked_address");
    return [{ address: bare, family: net.isIP(bare) }];
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolve(bare);
  } catch {
    throw new LmsFeedFetchError("unreachable");
  }
  if (addresses.length === 0) throw new LmsFeedFetchError("unreachable");
  if (addresses.some((entry) => isBlockedAddress(entry.address))) throw new LmsFeedFetchError("blocked_address");
  return addresses;
}

type RequestFn = (options: https.RequestOptions, callback: (response: IncomingMessage) => void) => {
  on(event: "error", listener: (error: Error) => void): unknown;
  destroy(error?: Error): unknown;
  end(): unknown;
};

export type FetchLmsFeedOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Tests inject DNS and the request function; production uses the system resolver and https. */
  resolve?: Resolver;
  request?: RequestFn;
};

function decodedStream(response: IncomingMessage): Readable {
  const encoding = String(response.headers["content-encoding"] ?? "").trim().toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return response.pipe(zlib.createGunzip());
  if (encoding === "deflate") return response.pipe(zlib.createInflate());
  if (encoding === "br") return response.pipe(zlib.createBrotliDecompress());
  return response;
}

/** Reads the body up to maxBytes (after decompression), else too_large. */
function readCapped(response: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(response.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      response.destroy();
      reject(new LmsFeedFetchError("too_large"));
      return;
    }
    const stream = decodedStream(response);
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        response.destroy();
        stream.destroy();
        reject(new LmsFeedFetchError("too_large"));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", () => reject(new LmsFeedFetchError("unreachable")));
    response.on("error", () => reject(new LmsFeedFetchError("unreachable")));
  });
}

/** Rejects with a timeout error once `deadline` (epoch ms) passes. */
function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new LmsFeedFetchError("timeout"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LmsFeedFetchError("timeout")), remaining);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type HopResult = { kind: "redirect"; location: string } | { kind: "body"; body: Buffer };

/**
 * Fetches a feed and returns its text. `rawUrl` may be a webcal:// or https:// link; anything that
 * fails normalizeLmsFeedUrl is invalid_url. Throws LmsFeedFetchError only.
 */
export async function fetchLmsFeed(rawUrl: string, options: FetchLmsFeedOptions = {}): Promise<string> {
  const maxBytes = options.maxBytes ?? LMS_FEED_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? LMS_FEED_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? LMS_FEED_MAX_REDIRECTS;
  const resolve = options.resolve ?? systemResolver;
  const request = options.request ?? (https.request as unknown as RequestFn);
  const deadline = Date.now() + timeoutMs;

  const first = normalizeLmsFeedUrl(rawUrl);
  if (!first.ok) throw new LmsFeedFetchError("invalid_url");
  let current = new URL(first.url);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const hostname = current.hostname.replace(/^\[|\]$/g, "");
    // Fail fast with a clear error; the lookup below re-checks at connect time. DNS counts toward
    // the same deadline as the request.
    await withDeadline(resolvePublic(hostname, resolve), deadline);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new LmsFeedFetchError("timeout");

    const result = await new Promise<HopResult>((resolveHop, rejectHop) => {
      let settled = false;
      const fail = (error: LmsFeedFetchError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.destroy();
        rejectHop(error);
      };

      const req = request(
        {
          protocol: "https:",
          hostname,
          servername: net.isIP(hostname) ? undefined : hostname,
          port: 443,
          method: "GET",
          path: `${current.pathname}${current.search}`,
          agent: false,
          headers: {
            "User-Agent": "AtlasCalendarSync/1.0",
            Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
          },
          // Connect only to an address that passes the check, re-resolved here so the socket can't
          // be pointed somewhere else between the check above and the connection.
          lookup: (host, lookupOptions, callback) => {
            resolvePublic(host, resolve).then(
              (addresses) => {
                const usable = addresses.filter((entry) => !lookupOptions.family || entry.family === lookupOptions.family);
                const list = usable.length > 0 ? usable : addresses;
                if (lookupOptions.all) (callback as (e: null, a: ResolvedAddress[]) => void)(null, list);
                else callback(null, list[0].address, list[0].family);
              },
              (error: Error) => callback(error as NodeJS.ErrnoException, "", 0),
            );
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            settled = true;
            clearTimeout(timer);
            resolveHop({ kind: "redirect", location: String(response.headers.location) });
            return;
          }
          if (status === 401 || status === 403 || status === 404 || status === 410) {
            response.resume();
            fail(new LmsFeedFetchError("rejected"));
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            fail(new LmsFeedFetchError("http_error"));
            return;
          }
          readCapped(response, maxBytes).then(
            (body) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              resolveHop({ kind: "body", body });
            },
            (error: unknown) => fail(error instanceof LmsFeedFetchError ? error : new LmsFeedFetchError("unreachable")),
          );
        },
      );
      const timer = setTimeout(() => fail(new LmsFeedFetchError("timeout")), remaining);
      req.on("error", (error) => fail(error instanceof LmsFeedFetchError ? error : new LmsFeedFetchError("unreachable")));
      req.end();
    });

    if (result.kind === "body") return result.body.toString("utf8");

    if (hop === maxRedirects) throw new LmsFeedFetchError("too_many_redirects");
    let next: URL;
    try {
      next = new URL(result.location, current);
    } catch {
      throw new LmsFeedFetchError("invalid_url");
    }
    const normalized = normalizeLmsFeedUrl(next.toString());
    // A redirect to http://, another port, or a credentialed URL is refused like a pasted one.
    if (!normalized.ok || next.protocol !== "https:") throw new LmsFeedFetchError("invalid_url");
    current = new URL(normalized.url);
  }

  throw new LmsFeedFetchError("too_many_redirects");
}
