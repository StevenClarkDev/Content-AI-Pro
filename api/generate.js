const MODEL = "claude-sonnet-4-20250514";
const { savePromptSession } = require("./promptSessions");

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY environment variable.",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({
        error: data.error?.message || "Anthropic request failed.",
      });
    }

    const text = data.content?.map((block) => block.text || "").join("") || "";
    let session = { stored: false };

    try {
      session = await savePromptSession({
        source: typeof body?.source === "string" ? body.source : "portal",
        tool: typeof body?.tool === "string" ? body.tool : null,
        platform: typeof body?.platform === "string" ? body.platform : null,
        tone: typeof body?.tone === "string" ? body.tone : null,
        keyword: typeof body?.keyword === "string" ? body.keyword : null,
        prompt,
        output: text,
        model: MODEL,
        ipAddress: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      });
    } catch (error) {
      console.error("Failed to save prompt session", error);
      session = { stored: false, reason: "Prompt session could not be saved." };
    }

    return res.status(200).json({ text, session });
  } catch (error) {
    return res.status(500).json({ error: "Generation failed. Please try again." });
  }
};
