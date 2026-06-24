import { NextResponse } from "next/server";

// Some browsers and third-party services still request this legacy path
// directly, even when the page declares its PNG favicon in metadata.
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/icon.png", request.url));
}
