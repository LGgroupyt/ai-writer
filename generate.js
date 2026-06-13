// netlify/functions/generate.js
// Secure Claude API proxy with server-side rate limiting

const MAX_FREE = 5;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const rateLimitStore = new Map();

function getClientId(event) {
  const ip =
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["client-ip"] ||
    "unknown";
  const ua = event.headers["user-agent"] || "";
  let hash = 0;
  const str = ip + ua;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return "uid_" + Math.abs(hash).toString(36);
}

function checkRateLimit(clientId) {
  const now = Date.now();
  const record = rateLimitStore.get(clientId);
  if (!record || now - record.windowStart > RATE_WINDOW_MS) {
    rateLimitStore.set(clientId, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_FREE - 1 };
  }
  if (record.count >= MAX_FREE) {
    const resetIn = Math.ceil((record.windowStart + RATE_WINDOW_MS - now) / 3600000);
    return { allowed: false, remaining: 0, resetIn };
  }
  record.count += 1;
  return { allowed: true, remaining:
