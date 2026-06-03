/**
 * Catch-all proxy route: /api/backend/* -> FastAPI backend.
 * Avoids CORS issues and centralizes the backend URL configuration.
 */
import { type NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000/api/v1";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  // Strip the /api/backend prefix
  const backendPath = pathname.replace(/^\/api\/backend/, "");
  const url = `${BACKEND_URL}${backendPath}${search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");

  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
    });

    const responseHeaders = new Headers(upstream.headers);
    // Remove hop-by-hop headers
    responseHeaders.delete("transfer-encoding");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[backend-proxy] upstream error:", err);
    return NextResponse.json(
      { error: "Backend unavailable", detail: String(err) },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
