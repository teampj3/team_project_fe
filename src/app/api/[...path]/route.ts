import { NextRequest, NextResponse } from "next/server";

const SPRING_API_BASE_URL =
  process.env.SPRING_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8080";

type RouteContext = {
  params: {
    path: string[];
  };
};

async function proxy(request: NextRequest, context: RouteContext) {
  const path = context.params.path.join("/");
  const targetUrl = new URL(`${SPRING_API_BASE_URL}/api/${path}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text(),
    cache: "no-store"
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("transfer-encoding");

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
