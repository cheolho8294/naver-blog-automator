/** OpenRouter는 OpenAI 스타일 `POST /api/v1/chat/completions` 만 제공합니다. Anthropic `/v1/messages` 경로는 404/HTML을 반환합니다. */

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export type VisionBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function blocksToUserContent(blocks: VisionBlock[]): string | ChatContentPart[] {
  const parts: ChatContentPart[] = [];
  for (const b of blocks) {
    if (b.type === "text") {
      if (b.text.trim()) parts.push({ type: "text", text: b.text });
    } else {
      const mt = b.source.media_type;
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mt};base64,${b.source.data}` },
      });
    }
  }
  if (parts.length === 0) return "";
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}

async function readFailureDetail(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      message?: string;
    } | null;
    const m = j?.error?.message ?? j?.message;
    if (m) return String(m);
    if (j) return JSON.stringify(j).slice(0, 500);
    return `HTTP ${res.status}`;
  }
  const raw = await res.text();
  if (raw.includes("<!DOCTYPE") || raw.includes("<html") || raw.includes("Not Found")) {
    return `OpenRouter가 API 대신 웹 페이지(예: 404)를 반환했습니다. (HTTP ${res.status}). chat/completions 엔드포인트를 확인하세요.`;
  }
  return raw.slice(0, 400).replace(/\s+/g, " ");
}

export async function openRouterChatCompletion(opts: {
  apiKey: string;
  referer: string;
  title: string;
  model: string;
  system: string;
  userBlocks: VisionBlock[];
  maxTokens: number;
}): Promise<string> {
  const userPayload = blocksToUserContent(opts.userBlocks);
  const messages: {
    role: "system" | "user";
    content: string | ChatContentPart[];
  }[] = [];

  const sys = opts.system.trim();
  if (sys) messages.push({ role: "system", content: sys });
  messages.push({ role: "user", content: userPayload !== "" ? userPayload : "(내용 없음)" });

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": opts.referer,
      "X-OpenRouter-Title": opts.title,
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens,
    }),
  });

  if (!res.ok) {
    const detail = await readFailureDetail(res);
    throw new Error(`OpenRouter: ${detail}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error("OpenRouter: JSON이 아닌 응답입니다.");
  }

  const data = (await res.json()) as {
    choices?: {
      message?: { content?: string | null };
      error?: { message?: string };
    }[];
    error?: { message?: string };
  };

  const choiceErr = data?.choices?.[0]?.error;
  if (choiceErr?.message) {
    throw new Error(`OpenRouter: ${choiceErr.message}`);
  }
  if (data?.error?.message) {
    throw new Error(`OpenRouter: ${data.error.message}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("OpenRouter: 모델이 빈 텍스트를 반환했습니다.");
  }
  return text;
}
