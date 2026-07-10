import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

// Lazily constructed so a missing KV_REST_API_URL/TOKEN doesn't crash the
// module at import time — routes check for null and return 503 instead of
// throwing, matching the "gate is live once configured" pattern from
// lib/auth.ts / PUBLISH_SECRET.
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

// See docs/race-readiness-design.md "Storage" for the key schema.
export const kvKeys = {
  racesIndex: "races:index",
  raceLatest: (id: string) => `race:${id}:latest`,
  raceHistory: (id: string) => `race:${id}:history`,
};
