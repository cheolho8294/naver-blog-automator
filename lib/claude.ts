import Anthropic from "@anthropic-ai/sdk";
import { loadUtf8FromRoot } from "./promptLoader";
import type { ResearchHit } from "./research";
import {
  jsonSchemaInstructions,
  parseAiBlogJson,
  totalKoreanCharCount,
  validateCollageGroups,
  validateImagePlanAgainstInputs,
  validatePhotoSelectionBand,
  type AiBlogJson,
} from "./blogSchema";

export type VisionMediaType = "image/jpeg" | "image/png" | "image/webp";

export interface ImagePlan {
  ordered: {
    order: number;
    groupId: number;
    caption: string;
    section: number;
    originalIndex: number;
  }[];
  excluded: { originalIndex: number; reason: string }[];
}

export interface BlogPost {
  title: string;
  introSummary?: string;
  tags: string[];
  sections: { heading: string; body: string; tableHtml?: string }[];
  comparisonNotes?: string;
  honestDownsides?: [string, string, string];
  faq?: { question: string; answer: string }[];
  cta: string;
}

export interface BlogPostWithImages extends BlogPost {
  imagePlan: ImagePlan;
}

export interface AutoFillResult {
  topic: string;
  keywords: string;
  notes: string;
  comparison: string;
}

type VisionContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: VisionMediaType; data: string } };

function anthropicOfficial(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  }
  return new Anthropic({
    apiKey,
    baseURL: "https://api.anthropic.com",
  });
}

function getClient(): Anthropic {
  return anthropicOfficial();
}

const AUTOFILL_SYSTEM_PROMPT = `당신은 세차·디테일링 전문가용 네이버 블로그 입력폼을 채우는 도우미입니다.
사용자가 올린 정지 사진(순서 유지)과 사진별 메모를 보고, 빈 필드만 JSON으로 채웁니다.

[출력]
반드시 단일 JSON 객체: {"topic":"...","keywords":"...","notes":"...","comparison":"..."}

[규칙]
- 사용자가 이미 입력한 필드는 절대 바꾸지 말 것. 채울 값이 없으면 "".
- topic: 시공/작업 한 줄 주제.
- keywords: 쉼표로 구분된 검색 키워드 다섯 개 내외.
- notes: 1인칭. 현장 순서·압력/속도감·시간·실수 방지 같은 노하우 3~6문장. 메모·사진 근거 우선.
- comparison: "시공 전 vs 시공 후" 또는 "기존 vs 이번" 한두 문장.
- 추측 과장 금지. 사진에 안 보이면 일반적인 보수적 표현.
- JSON 외 텍스트 금지.`;

function extractJsonObject(text: string): string {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("JSON 파싱 실패");
  return m[0];
}

function buildCta(e: AiBlogJson["engagement"]): string {
  const lines: string[] = [e.savePrompt];
  if (e.commentQuestions.length) {
    lines.push("", "댓글로 남겨주세요.");
    for (const q of e.commentQuestions) lines.push(`- ${q}`);
  }
  if (e.relatedLinkPlaceholders.length) {
    lines.push("", "관련 글");
    for (const r of e.relatedLinkPlaceholders) {
      lines.push(`- ${r.label} [관련글: ${r.slug}]`);
    }
  }
  return lines.join("\n");
}

function toBlogPostWithImages(data: AiBlogJson): BlogPostWithImages {
  return {
    title: data.title,
    introSummary: data.introSummary,
    tags: data.tags,
    sections: data.sections.map((s) => ({
      heading: s.heading,
      body: s.body,
      tableHtml: s.tableHtml,
    })),
    comparisonNotes: data.comparisonBlock,
    honestDownsides: data.honestDownsides,
    faq: data.faq.map((f) => ({ question: f.q, answer: f.a })),
    cta: buildCta(data.engagement),
    imagePlan: data.imagePlan,
  };
}

export async function analyzeImagesForAutoFill(params: {
  images: { base64: string; mediaType: VisionMediaType; caption?: string }[];
  nonImageFilenames: string[];
  prefilled: AutoFillResult;
}): Promise<AutoFillResult> {
  const { images, nonImageFilenames, prefilled } = params;
  const captionHint =
    images
      .map((img, seq) =>
        img.caption?.trim() ? `${seq + 1}번째 사진 코멘트: ${img.caption.trim()}` : null,
      )
      .filter(Boolean)
      .join("\n") || "(사진별 코멘트 없음)";

  const promptText = `[이미 입력된 필드 — 덮어쓰지 말 것]
topic: ${prefilled.topic || "(비어있음)"}
keywords: ${prefilled.keywords || "(비어있음)"}
notes: ${prefilled.notes || "(비어있음)"}
comparison: ${prefilled.comparison || "(비어있음)"}

[업로드 순서별 작성자 코멘트]
${captionHint}

[추가 파일(이미지 아님)]
${nonImageFilenames.join(", ") || "없음"}

비어 있는 필드만 채워 JSON으로 반환.`;

  const content: VisionContentBlock[] = [];
  for (const img of images) {
    if (img.caption?.trim()) {
      content.push({
        type: "text",
        text: `[업로드 순서 — 작성자 코멘트]\n${img.caption.trim()}`,
      });
    }
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
  }
  content.push({ type: "text", text: promptText });

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: [{ type: "text", text: AUTOFILL_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const raw = extractJsonObject(text);
  const parsed = JSON.parse(raw) as AutoFillResult;
  return parsed;
}

export async function generateBlogPostWithImages(params: {
  form: { topic: string; keywords: string; notes: string; comparison: string };
  images: {
    base64: string;
    mediaType: VisionMediaType;
    originalIndex: number;
    caption?: string;
  }[];
  allowedOriginalIndices: number[];
  researchHits: ResearchHit[];
}): Promise<BlogPostWithImages> {
  const { form, images, allowedOriginalIndices, researchHits } = params;
  const systemBase = loadUtf8FromRoot("prompts/system.ko.md");

  const researchBlock =
    researchHits.length === 0
      ? "(검색 스니펫 없음)"
      : researchHits
          .map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.snippet}`)
          .join("\n\n");

  const interleaved: VisionContentBlock[] = [];
  for (const img of images) {
    const cap = img.caption?.trim();
    interleaved.push({
      type: "text",
      text: `[원본 originalIndex=${img.originalIndex}]${cap ? `\n작성자 사진 코멘트: ${cap}` : ""}`,
    });
    interleaved.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
  }

  const allowedCsv = [...new Set(allowedOriginalIndices)].sort((a, b) => a - b).join(", ");
  interleaved.push({
    type: "text",
    text: `[폼 입력]
주제: ${form.topic}
키워드: ${form.keywords}
내 경험 메모: ${form.notes || "(없음)"}
비교 대상: ${form.comparison || "(없음)"}

업로드된 분석 가능 이미지 수: ${allowedOriginalIndices.length}
허용 originalIndex 목록만 imagePlan에 사용: ${allowedCsv}

[검색 스니펫 — 사실 확인 없이 과장하지 말고 참고만]
${researchBlock}

아래 스키마·조건을 정확히 따른 단일 RAW JSON만 출력합니다.

${jsonSchemaInstructions()}
`,
  });

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: systemBase,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: interleaved }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  let data: AiBlogJson;
  try {
    data = parseAiBlogJson(JSON.parse(extractJsonObject(text)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`JSON 검증: ${msg}`);
  }

  const uploadCount = allowedOriginalIndices.length;
  const errPlan = validateImagePlanAgainstInputs(data, allowedOriginalIndices);
  if (errPlan) throw new Error(`JSON 검증: ${errPlan}`);

  const errGroup = validateCollageGroups(data);
  if (errGroup) throw new Error(`JSON 검증: ${errGroup}`);

  const errBand = validatePhotoSelectionBand(data, uploadCount);
  if (errBand) throw new Error(`JSON 검증: ${errBand}`);

  if (totalKoreanCharCount(data) < 1500) {
    throw new Error("JSON 검증: 본문 한글 분량이 1500자 미만입니다.");
  }

  return toBlogPostWithImages(data);
}
