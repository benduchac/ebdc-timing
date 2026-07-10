import { NextResponse } from "next/server";

// Proxies the current-time check server-side. Most simple time APIs
// (including this one's predecessor, timeapi.io) don't send
// Access-Control-Allow-Origin, so calling them directly from the browser via
// fetch() is silently blocked by CORS even though curl or a server-side
// fetch works fine — proxying here avoids depending on any given provider
// supporting CORS. No auth needed — this returns nothing sensitive, just the
// current time.
export async function GET() {
  try {
    const res = await fetch("https://time.now/developer/api/timezone/UTC", {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Time service returned ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    // unixtime is whole seconds; ms precision isn't meaningful for a clock
    // drift check with a 5s+ threshold anyway.
    return NextResponse.json({
      ok: true,
      serverTimeMs: data.unixtime * 1000,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Time service unreachable" },
      { status: 502 }
    );
  }
}
