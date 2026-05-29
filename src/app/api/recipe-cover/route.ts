import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";
import { isIP } from "net";
import {
  isInstagramCDNURLExpired,
  upstreamCoverRequestHeaders,
} from "@/lib/cookpilot/coverUpstreamRequest";

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 5;

function isPrivateIP(ip: string): boolean {
  // IPv6 loopback / unspecified
  if (ip === "::1" || ip === "::") return true;

  // Unwrap IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1] ?? ip;
  const parts = v4.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||                            // 10.0.0.0/8
    a === 127 ||                           // 127.0.0.0/8 loopback
    a === 0 ||                             // 0.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0/12
    (a === 192 && b === 168) ||            // 192.168.0.0/16
    (a === 169 && b === 254)               // 169.254.0.0/16 link-local (AWS metadata)
  );
}

async function isBlockedHost(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return isPrivateIP(hostname);
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return isPrivateIP(address);
  } catch {
    return true;
  }
}

// Follows redirects manually so every hop's hostname is validated before the
// next request fires, preventing DNS-rebinding from slipping through the
// initial isBlockedHost check via a mid-chain redirect to an internal address.
async function fetchWithSafeRedirects(startUrl: URL): Promise<Response> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), {
      headers: upstreamCoverRequestHeaders(current),
      redirect: "manual",
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) return new Response(null, { status: 502 });

    let next: URL;
    try {
      next = new URL(location, current.toString());
    } catch {
      return new Response(null, { status: 502 });
    }

    if (next.protocol !== "http:" && next.protocol !== "https:") {
      return new Response(null, { status: 403 });
    }

    if (await isBlockedHost(next.hostname)) {
      return new Response(null, { status: 403 });
    }

    current = next;
  }

  return new Response(null, { status: 502 });
}

async function readBodyCapped(body: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (await isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 403 });
  }

  if (isInstagramCDNURLExpired(rawUrl)) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[RecipeImage] recipe-cover instagram URL expired (oe)", {
        host: target.hostname,
      });
    }
    return new NextResponse(null, { status: 410 });
  }

  try {
    const upstream = await fetchWithSafeRedirects(target);

    if (!upstream.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[RecipeImage] recipe-cover upstream error", {
          host: target.hostname,
          status: upstream.status,
        });
      }
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[RecipeImage] recipe-cover not an image", {
          host: target.hostname,
          contentType,
        });
      }
      return new NextResponse(null, { status: 415 });
    }

    // Reject before reading if Content-Length already exceeds the cap.
    const contentLength = upstream.headers.get("content-length");
    if (contentLength !== null && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    if (!upstream.body) {
      return new NextResponse(null, { status: 502 });
    }

    const bytes = await readBodyCapped(upstream.body);
    if (bytes === null) {
      return new NextResponse(null, { status: 413 });
    }

    return new NextResponse(bytes.buffer as ArrayBuffer, {
      headers: {
        "Cache-Control": "private, max-age=86400",
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[RecipeImage] recipe-cover fetch failed", {
        host: target.hostname,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
    return new NextResponse(null, { status: 502 });
  }
}
