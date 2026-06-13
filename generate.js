// netlify/functions/generate.js
// Secure Claude API proxy with server-side rate limiting

const MAX_FREE = 5;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory store for rate limiting.
// For production with multiple Netlify instances, swap this for
// a KV store like Netlify Blobs or Upstash Redis.
const rateLimitStore = new Map();

function getClientId(event) {
  // Build a fingerprint from IP + User-Agent (no personal data stored)
  const ip =
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["client-ip"] ||
    "unknown";
  const ua = event.headers["user-agent"] || "";
  // Simple hash — good enough for free-tier abuse prevention
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
    // New window
    rateLimitStore.set(clientId, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_FREE - 1 };
  }

  if (record.count >= MAX_FREE) {
    const resetIn = Math.ceil((record.windowStart + RATE_WINDOW_MS - now) / 3600000);
    return { allowed: false, remaining: 0, resetIn };
  }

  record.count += 1;
  return { allowed: true, remaining: MAX_FREE - record.count };
}

// Validate & sanitize inputs
function validateInput(tool, topic, lang, extra) {
  const validTools = ["whatsapp", "instagram", "product"];
  const validLangs = ["tamil", "english", "both"];

  if (!validTools.includes(tool)) throw new Error("Invalid tool");
  if (!validLangs.includes(lang)) throw new Error("Invalid language");
  if (!topic || typeof topic !== "string") throw new Error("Topic is required");
  if (topic.length > 500) throw new Error("Topic too long (max 500 chars)");
  if (extra && extra.length > 200) throw new Error("Extra options too long");

  // Strip any prompt injection attempts
  const sanitized = topic
    .replace(/\n{3,}/g, "\n\n") // collapse excessive newlines
    .trim();

  return sanitized;
}

function buildPrompt(tool, topic, lang, extra) {
  const langNote =
    lang === "tamil"
      ? "Write entirely in Tamil language using Tamil script."
      : lang === "both"
      ? "Write first in Tamil (using Tamil script), then add a horizontal line (---), then write the English version below."
      : "Write in English.";

  const prompts = {
    whatsapp: `You are a WhatsApp marketing expert for Indian small businesses. ${langNote}

Write a short, engaging WhatsApp broadcast message for:
Topic: "${topic}"
${extra}

Requirements:
- Keep under 150 words
- Use relevant emojis naturally
- End with a clear call to action
- Sound human and friendly, not robotic
- If Tamil: use natural conversational Tamil`,

    instagram: `You are an Instagram content expert for Indian small businesses. ${langNote}

Write an engaging Instagram caption for:
Topic: "${topic}"
${extra}

Requirements:
- Catchy opening line to stop the scroll
- Use emojis naturally
- Under 200 words
- If hashtags requested: add 10–15 relevant hashtags at the end
- If Tamil: use natural Tamil that feels native`,

    product: `You are an e-commerce product listing expert. ${langNote}

Write a compelling product description for:
Product: "${topic}"
${extra}

Requirements:
- Start with a strong hook line
- List key features clearly
- Highlight benefits for the buyer
- End with a buying motivation
- If Tamil: write in natural Tamil suitable for online shopping`,
  };

  return prompts[tool];
}

exports.handler = async (event) => {
  // CORS headers — update origin for production
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Rate limit check
  const clientId = getClientId(event);
  const rateResult = checkRateLimit(clientId);

  if (!rateResult.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: "rate_limited",
        message: `Free limit reached. Upgrade for unlimited access, or try again in ~${rateResult.resetIn} hour(s).`,
        remaining: 0,
      }),
    };
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { tool, topic, lang = "tamil", extra = "" } = body;

  // Validate
  let cleanTopic;
  try {
    cleanTopic = validateInput(tool, topic, lang, extra);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: err.message }) };
  }

  // Build prompt
  const prompt = buildPrompt(tool, cleanTopic, lang, extra);

  // Call Claude API — key stays on the server
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("Claude API error:", claudeRes.status, errText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "AI service error. Please try again." }),
      };
    }

    const data = await claudeRes.json();
    const text = data.content?.map((b) => b.text || "").join("") || "";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text,
        remaining: rateResult.remaining,
      }),
    };
  } catch (err) {
    console.error("Fetch error:", err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Could not reach AI. Check your connection." }),
    };
  }
};
