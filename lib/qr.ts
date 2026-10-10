import { headers } from "next/headers";
import QRCode from "qrcode";

// Server-only: the QR code on the TV leaderboard, drawn here as an SVG string
// so the qrcode package never reaches the browser.

// The absolute URL of a path on this site, from the request that's being
// rendered — so the code points at whichever host the TV loaded from.
export async function absoluteUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
