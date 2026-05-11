const MODEL = "claude-sonnet-4-20250514";
import { getAuthenticatedUser } from "./authUtils.js";
import { savePromptSession, type PromptSessionSaveResult } from "./promptSessions.js";
import type { ApiRequest, ApiResponse, HeaderValue } from "./httpTypes.js";

type GenerateRequestBody = {
  prompt?: unknown;
  source?: unknown;
  tool?: unknown;
  platform?: unknown;
  tone?: unknown;
  keyword?: unknown;
  imageData?: unknown;
  imageName?: unknown;
};

type AnthropicTextBlock = {
  text?: string;
};

type AnthropicMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: {
            type: "base64";
            media_type: string;
            data: string;
          };
        }
    >;

type AnthropicResponse = {
  content?: AnthropicTextBlock[];
  error?: {
    message?: string;
  };
};

function firstHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseImageDataUrl(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return {
    mediaType: match[1],
    data: match[2],
  };
}

function setCorsHeaders(req: ApiRequest, res: ApiResponse) {
  const origin = firstHeader(req.headers.origin) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in to generate content." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY environment variable.",
    });
  }

  let body = req.body as GenerateRequestBody | string | undefined;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}") as GenerateRequestBody;
    } catch {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }
  const image = parseImageDataUrl(body?.imageData);
  if (body?.imageData && !image) {
    return res.status(400).json({ error: "Uploaded image must be a PNG, JPG, WebP, or GIF data URL." });
  }

  try {
    const content: AnthropicMessageContent = image
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

    const data = (await anthropicRes.json()) as AnthropicResponse;
    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({
        error: data.error?.message || "Anthropic request failed.",
      });
    }

    const text = data.content?.map((block) => block.text || "").join("") || "";
    let session: PromptSessionSaveResult = { stored: false, reason: "Prompt session was not saved." };

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
        ipAddress: firstHeader(req.headers["x-forwarded-for"])?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
        userAgent: firstHeader(req.headers["user-agent"]) || null,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      });
    } catch (error) {
      console.error("Failed to save prompt session", error);
      session = { stored: false, reason: "Prompt session could not be saved." };
    }

    return res.status(200).json({ text, session });
  } catch (error) {
    return res.status(500).json({ error: "Generation failed. Please try again." });
  }
}
