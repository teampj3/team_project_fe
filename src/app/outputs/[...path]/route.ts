import { NextRequest, NextResponse } from "next/server";

const SPRING_API_BASE_URL =
  process.env.SPRING_API_BASE_URL?.replace(/\/$/, "") ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "");

type RouteContext = {
  params: {
    path: string[];
  };
};

async function proxy(request: NextRequest, context: RouteContext) {
  if (!SPRING_API_BASE_URL) {
    return NextResponse.json(
      {
        message: "SPRING_API_BASE_URL is not configured.",
        errorCode: "SPRING_API_BASE_URL_MISSING"
      },
      { status: 500 }
    );
  }

  const path = context.params.path.join("/");
  const targetUrl = new URL(`${SPRING_API_BASE_URL}/outputs/${path}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown proxy error";

    return NextResponse.json(
      {
        message: "Failed to reach Spring outputs from Next proxy.",
        errorCode: "SPRING_OUTPUTS_PROXY_FETCH_FAILED",
        detail: message,
        target: targetUrl.toString()
      },
      { status: 502 }
    );
  }
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

export const GET = proxy;
export const HEAD = proxy;
