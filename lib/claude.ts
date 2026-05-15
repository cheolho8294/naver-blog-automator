import Anthropic from "@anthropic-ai/sdk";
import { OPENROUTER_KEY_IN_ANTHROPIC_SLOT } from "./anthropicErrors";
import { openRouterChatCompletion } from "./openrouter";
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

// <sync-blog-system-prompt-begin>
/** 블로그 글 생성 시스템 프롬프트 — fs 미사용(Vercel). 동기화: npm run sync-blog-prompt */
export const BLOG_SYSTEM_KO_MD = "당신은 대한민국 네이버 블로그에 게시할 **세차·디테일링·광택·코팅** 분야 전문가용 초안을 작성한다.\n\n## 출력 형식 (절대 준수)\n\n- 응답은 **RAW JSON 한 개**만 출력한다. 마크다운 펜스나 설명 문장을 덧붙이지 않는다.\n- JSON 필드명·중첩 구조는 사용자 메시지에 포함된 **스키마 안내**와 동일해야 한다.\n\n## 톤·윤리·가독성 (모바일 최우선)\n\n- 문장과 단락은 **휴대폰 화면**을 기준으로 짧고 간결하게 쓴다.\n- 독자에게 **존댓말·친절한 설명체**(~습니다/~해요)를 유지하고, **반말·명령형·과한 친근체**는 쓰지 않는다.\n- 한 단락(빈 줄 `\\\\n\\\\n` 기준) 안에서는 **대략 4줄~길어도 6줄 이하**가 되도록 줄바꿈(`\\\\n`)과 공백으로 호흡을 나눈다.\n- 실제로 찍은 사진과 사용자 메모를 근거로 쓴다. 없는 체험·없는 수치를 만들지 않는다.\n- 과장 광고·비교 우월 선언(법적 리스크)은 피하고, 체감·관찰 가능한 사실 위주로 쓴다.\n- 이모지는 넣지 않는다.\n\n## D.I.A 구성\n\n1. **도입(D)**: 독자 관심·공감·이 글에서 얻을 정보를 한 번에 짚는다(`introSummary`, 첫 소제목).\n2. **정보(I)**: 공정 순서·비교·표(근거 있을 때만)·FAQ로 정보를 압축해 전달한다.\n3. **행동(A)**: 댓글 질문·저장·관련 글로 자연스럽게 연결한다(`engagement`).\n\n## 사진·콜라주(네이버 앱 기준)\n\n- `imagePlan`에서 **같은 groupId**로 묶인 사진 수는 **반드시 2장 또는 4장**이다. (앱에서 2열·2×2 콜라주)\n- 업로드가 **8장 이상**이면 본문에 쓸 사진은 **8~13장**만 남기고, 나머지는 `excluded`에 간단한 이유를 적는다. 순서는 **작업 흐름**이 자연스럽게 이어지게 한다.\n- 본문 패턴은 「**[Gn] 마커 → 줄바꿈 → 짧은 설명**」을 반복해, 사진 다음에 한 번 띄운 뒤 글이 오도록 한다.\n\n## 콘텐츠 규칙\n\n1. **title**: 핵심 키워드를 앞쪽에. 숫자·경험·솔직함이 드러나는 제목 패턴.\n2. **introSummary**: 약 120~180자. 독자가 얻는 정보를 한 번에 말한다.\n3. **sections**: 최소 5개. 각 **heading**은 `소제목1 …`, `소제목2 …`처럼 번호를 포함한다.\n4. 각 **sections[].body**:\n   - 단락은 `\\\\n\\\\n`로 구분한다.\n   - 한 단락에는 **핵심 한 가지**만 담는다.\n   - `[G1]` 등 마커는 단락의 앞쪽에 두고, 마커 다음 줄부터 설명을 이어간다.\n5. **tableHtml**: 사용자 메모나 조사 스니펫에 근거가 있을 때만 HTML `<table>` 을 넣는다. 없으면 빈 문자열 `\"\"`.\n6. **honestDownsides**: 길이 정확히 3. 솔직한 아쉬운 점(짧게).\n7. **comparisonBlock**: 이전 vs 이번을 분명히 비교한다(짧은 줄·적당한 공백).\n8. **faq**: 검색 의도에 맞는 질문 2개 이상.\n9. **engagement**: 댓글 유도 질문, 저장 멘트, 관련 글 자리(slug만).\n10. **imagePlan**: **originalIndex**는 프롬프트에 제시된 허용 값만 사용한다.\n\n## 분량\n\n- JSON 안의 한글 본문 전체(마커·HTML 태그 제외 후 공백 제외)가 **최소 1,500자**가 되도록 쓴다.\n";
// <sync-blog-system-prompt-end>

export const AI_PROVIDER_API_KEY_MISSING = "AI_PROVIDER_API_KEY_MISSING";

function normalizeSecret(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  let s = raw.replace(/\uFEFF/g, "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.length > 0 ? s : null;
}

function normalizeOpenRouterReferer(url: string | undefined): string {
  const t = normalizeSecret(url);
  if (t?.startsWith("http://") || t?.startsWith("https://")) return t;
  if (t) return `https://${t}`;
  const v = normalizeSecret(process.env.VERCEL_URL);
  return v ? (v.startsWith("http") ? v : `https://${v}`) : "http://localhost:3000";
}

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

type MessagingRuntime =
  | {
      provider: "openrouter";
      apiKey: string;
      referer: string;
      title: string;
      modelAutofill: string;
      modelBlog: string;
    }
  | {
      provider: "anthropic";
      client: Anthropic;
      modelAutofill: string;
      modelBlog: string;
    };

function getMessagingRuntime(): MessagingRuntime {
  const orKey = normalizeSecret(process.env.OPENROUTER_API_KEY);
  if (orKey) {
    const referer = normalizeOpenRouterReferer(
      process.env.OPENROUTER_HTTP_REFERER ?? process.env.VERCEL_URL,
    );
    const title =
      normalizeSecret(process.env.OPENROUTER_APP_TITLE) ?? "Naver Blog Automator";
    const baseModel =
      normalizeSecret(process.env.OPENROUTER_MODEL) ?? "anthropic/claude-sonnet-4";
    const modelAutofill =
      normalizeSecret(process.env.OPENROUTER_MODEL_AUTOFILL) ?? baseModel;
    const modelBlog =
      normalizeSecret(process.env.OPENROUTER_MODEL_BLOG) ?? baseModel;
    return {
      provider: "openrouter",
      apiKey: orKey,
      referer,
      title,
      modelAutofill,
      modelBlog,
    };
  }

  const anKey = normalizeSecret(process.env.ANTHROPIC_API_KEY);
  if (!anKey) {
    throw new Error(AI_PROVIDER_API_KEY_MISSING);
  }
  if (/^sk-or-v1-/i.test(anKey)) {
    throw new Error(OPENROUTER_KEY_IN_ANTHROPIC_SLOT);
  }
  const defaultAn = "claude-sonnet-4-6";
  return {
    provider: "anthropic",
    client: new Anthropic({
      apiKey: anKey,
      baseURL: "https://api.anthropic.com",
    }),
    modelAutofill:
      normalizeSecret(process.env.ANTHROPIC_MODEL_AUTOFILL) ?? defaultAn,
    modelBlog: normalizeSecret(process.env.ANTHROPIC_MODEL_BLOG) ?? defaultAn,
  };
}

async function invokeVisionCompletion(params: {
  rt: MessagingRuntime;
  model: string;
  systemText: string;
  userBlocks: VisionContentBlock[];
  maxTokens: number;
}): Promise<string> {
  const { rt, model, systemText, userBlocks, maxTokens } = params;
  if (rt.provider === "openrouter") {
    return openRouterChatCompletion({
      apiKey: rt.apiKey,
      referer: rt.referer,
      title: rt.title,
      model,
      system: systemText,
      userBlocks,
      maxTokens,
    });
  }
  const response = await rt.client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: systemText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userBlocks }],
  });
  return response.content[0]?.type === "text" ? response.content[0].text : "";
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

  const rt = getMessagingRuntime();
  const text = await invokeVisionCompletion({
    rt,
    model: rt.modelAutofill,
    systemText: AUTOFILL_SYSTEM_PROMPT,
    userBlocks: content,
    maxTokens: 1200,
  });
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
  const systemBase = BLOG_SYSTEM_KO_MD;

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

  const rt = getMessagingRuntime();
  const text = await invokeVisionCompletion({
    rt,
    model: rt.modelBlog,
    systemText: systemBase,
    userBlocks: interleaved,
    maxTokens: 8192,
  });
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
