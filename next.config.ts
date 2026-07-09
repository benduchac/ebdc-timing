import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  // Service worker source + generated output.
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // No service worker in dev — avoids stale-cache confusion while iterating.
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSerwist(nextConfig);
