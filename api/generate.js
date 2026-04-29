const MODEL = "claude-sonnet-4-20250514";

module.exports = async function handler(req, res) {
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

  const image = body?.image;
  const hasImage = image && typeof image.data === "string" && typeof image.mediaType === "string";
  const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  if (image && !hasImage) {
    return res.status(400).json({ error: "Image must include base64 data and mediaType." });
  }
  if (hasImage && !allowedImageTypes.has(image.mediaType)) {
    return res.status(400).json({ error: "Unsupported image type. Use JPEG, PNG, GIF, or WebP." });
  }

  const content = hasImage
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: image.mediaType,
            data: image.data,
          },
        },
        {
          type: "text",
          text: prompt,
        },
      ]
    : prompt;

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
            content,
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
    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: "Generation failed. Please try again." });
  }
};
