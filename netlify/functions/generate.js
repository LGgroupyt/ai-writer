exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { tool, topic, lang = "tamil", extra = "" } = body;

  if (!topic) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Topic is required" }) };
  }

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
- Sound human and friendly, not robotic`,

    instagram: `You are an Instagram content expert for Indian small businesses. ${langNote}
Write an engaging Instagram caption for:
Topic: "${topic}"
${extra}
Requirements:
- Catchy opening line to stop the scroll
- Use emojis naturally
- Under 200 words
- If hashtags requested: add 10-15 relevant hashtags at the end`,

    product: `You are an e-commerce product listing expert. ${langNote}
Write a compelling product description for:
Product: "${topic}"
${extra}
Requirements:
- Start with a strong hook line
- List key features clearly
- Highlight benefits for the buyer
- End with a buying motivation`,
  };

  const prompt = prompts[tool] || prompts.whatsapp;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: "AI service error. Please try again." }) };
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text, remaining: 4 }),
    };
  } catch (err) {
    console.error("Fetch error:", err);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Could not reach AI. Check your connection." }) };
  }
};
