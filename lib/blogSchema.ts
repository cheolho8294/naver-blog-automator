import { z } from "zod";

/** Claude가 반환해야 하는 원시 JSON 구조 */
export const aiBlogJsonSchema = z.object({
  title: z.string().min(12).max(100),
  introSummary: z.string().min(80).max(260),
  tags: z.array(z.string().min(1).max(40)).min(3).max(18),
  sections: z
    .array(
      z.object({
        heading: z.string().min(3).max(120),
        body: z.string().min(40),
        tableHtml: z.string().max(8000).optional(),
      })
    )
    .min(5)
    .max(14),
  honestDownsides: z.tuple([
    z.string().min(8),
    z.string().min(8),
    z.string().min(8),
  ]),
  comparisonBlock: z.string().min(60),
  faq: z
    .array(
      z.object({
        q: z.string().min(5),
        a: z.string().min(10),
      })
    )
    .min(2)
    .max(8),
  engagement: z.object({
    commentQuestions: z.array(z.string().min(8)).min(1).max(4),
    savePrompt: z.string().min(15),
    relatedLinkPlaceholders: z
      .array(
        z.object({
          label: z.string().min(2),
          slug: z.string().min(2),
        })
      )
      .min(1)
      .max(6),
  }),
  imagePlan: z.object({
    ordered: z.array(
      z.object({
        order: z.number().int().min(1),
        groupId: z.number().int().min(1),
        caption: z.string(),
        section: z.number().int().min(0),
        originalIndex: z.number().int().min(0),
      })
    ),
    excluded: z.array(
      z.object({
        originalIndex: z.number().int().min(0),
        reason: z.string(),
      })
    ),
  }),
});

export type AiBlogJson = z.infer<typeof aiBlogJsonSchema>;

/** 제목·요약·소제목·본문 등 합산(태그 포함), 공백·[Gn]·HTML 태그 제외 */
export const MIN_BLOG_BODY_CHARS = 1200;

const GROUP_MARKER_RE = /\[G\d+\]/g;

export function stripForCharCount(s: string): string {
  const noMarkers = s.replace(GROUP_MARKER_RE, "");
  const noHtml = noMarkers.replace(/<[^>]*>/g, "");
  return noHtml.replace(/\s/g, "");
}

/** 모바일 기준: 한 덩어리(빈 줄로 구분)가 과도하게 길지 않게 */
export function paragraphsWithinMaxChars(body: string, maxChars = 520): boolean {
  const paras = body
    .split(/\n\n+/)
    .map((p) => p.replace(GROUP_MARKER_RE, "").trim())
    .filter(Boolean);
  return paras.every((p) => p.replace(/\s/g, "").length <= maxChars);
}

/** 단락 내부 줄 수: 모바일에서 한 덩어리가 길어 보이지 않게 (대략 4~6줄 가이드 상한) */
export function paragraphBlocksRespectLineCap(body: string, maxLinesPerBlock = 6): boolean {
  const blocks = body
    .split(/\n\n+/)
    .map((b) => b.replace(GROUP_MARKER_RE, "").trim())
    .filter(Boolean);
  for (const b of blocks) {
    const lines = b.split("\n").length;
    if (lines > maxLinesPerBlock) return false;
  }
  return true;
}

/** 각 그룹은 네이버 콜라주 기준 2장 또는 4장만 허용 */
export function validateCollageGroups(data: AiBlogJson): string | null {
  const byGroup = new Map<number, number>();
  for (const row of data.imagePlan.ordered) {
    byGroup.set(row.groupId, (byGroup.get(row.groupId) || 0) + 1);
  }
  for (const [gid, cnt] of byGroup) {
    if (cnt !== 2 && cnt !== 4) {
      return `그룹${gid}은 사진 2장 또는 4장만 허용합니다(현재 ${cnt}장). 네이버 앱에서 2열·2×2 콜라주에 맞추세요.`;
    }
  }
  return null;
}

/**
 * 업로드 8장 이상이면 본문 활용 장수는 8~min(13, 업로드) 중 짝수만 (2·4 콜라주 합).
 */
export function validatePhotoSelectionBand(
  data: AiBlogJson,
  uploadCount: number
): string | null {
  const orderedN = data.imagePlan.ordered.length;
  if (uploadCount >= 8) {
    const hi = Math.min(13, uploadCount);
    const allowed: number[] = [];
    for (let n = 8; n <= hi; n++) {
      if (n % 2 === 0) allowed.push(n);
    }
    if (!allowed.includes(orderedN)) {
      return `2·4장 콜라주만 허용되어 본문 사진 장수는 짝수만 가능합니다. 권장: ${allowed.join(", ")}장 중 하나 (현재 ${orderedN}장).`;
    }
  }
  return null;
}

export function totalKoreanCharCount(data: AiBlogJson): number {
  let t = "";
  t += data.title + data.introSummary + data.comparisonBlock;
  for (const tag of data.tags) {
    t += tag;
  }
  for (const s of data.sections) {
    t += s.heading + s.body + (s.tableHtml ?? "");
  }
  for (const d of data.honestDownsides) t += d;
  for (const f of data.faq) t += f.q + f.a;
  t += data.engagement.savePrompt;
  t += data.engagement.commentQuestions.join("");
  for (const r of data.engagement.relatedLinkPlaceholders) {
    t += r.label + r.slug;
  }
  return stripForCharCount(t).length;
}

/** allowedOriginalIndices: 업로드 미디어 목록에서의 실제 인덱스 집합 */
export function validateImagePlanAgainstInputs(
  data: AiBlogJson,
  allowedOriginalIndices: number[]
): string | null {
  if (allowedOriginalIndices.length <= 0) return "이미지가 없습니다";

  const allowed = new Set(allowedOriginalIndices);

  const seenOrder = new Set<number>();
  for (const row of data.imagePlan.ordered) {
    if (!allowed.has(row.originalIndex)) {
      return `imagePlan ordered 잘못된 originalIndex: ${row.originalIndex}`;
    }
    if (seenOrder.has(row.order)) return `imagePlan 중복 order: ${row.order}`;
    seenOrder.add(row.order);
  }

  const used = new Set(data.imagePlan.ordered.map((o) => o.originalIndex));
  for (const ex of data.imagePlan.excluded) {
    if (!allowed.has(ex.originalIndex)) {
      return `imagePlan excluded 잘못된 originalIndex: ${ex.originalIndex}`;
    }
    if (used.has(ex.originalIndex)) {
      return `originalIndex ${ex.originalIndex} 가 ordered와 excluded에 동시 존재`;
    }
  }

  for (const idx of allowed) {
    const inOrdered = data.imagePlan.ordered.some((o) => o.originalIndex === idx);
    const inExcluded = data.imagePlan.excluded.some((e) => e.originalIndex === idx);
    if (!inOrdered && !inExcluded) {
      return `originalIndex ${idx} 가 ordered/excluded 어디에도 없음`;
    }
  }

  for (const row of data.imagePlan.ordered) {
    if (row.section < 0 || row.section >= data.sections.length) {
      return `imagePlan section 범위 오류: ${row.section}`;
    }
  }

  return null;
}

/**
 * imagePlan.section은 앱·포맷터에서 sections 배열의 0-based 인덱스다.
 * 모델이 소제목 번호(1-based)로 넣는 경우가 많아 보정한다.
 */
function normalizeImagePlanSections(data: AiBlogJson): void {
  const n = data.sections.length;
  const rows = data.imagePlan.ordered;
  if (rows.length === 0 || n <= 0) return;

  const secs = rows.map((r) => r.section);
  const allOneBased =
    secs.every((s) => s >= 1 && s <= n) && !secs.some((s) => s === 0);

  if (allOneBased) {
    for (const row of rows) {
      row.section -= 1;
    }
    return;
  }

  for (const row of rows) {
    if (row.section < 0 || row.section >= n) {
      if (row.section >= 1 && row.section <= n) {
        row.section -= 1;
      }
    }
  }
}

export function parseAiBlogJson(raw: unknown): AiBlogJson {
  const data = aiBlogJsonSchema.parse(raw);
  normalizeImagePlanSections(data);
  return data;
}

export function jsonSchemaInstructions(): string {
  return [
    "다음 키를 가진 JSON 단일 객체를 출력한다.",
    "{",
    '  "title": string,',
    '  "introSummary": string,',
    '  "tags": string[],',
    '  "sections": { "heading": string, "body": string, "tableHtml"?: string }[],',
    '  "honestDownsides": [string, string, string],',
    '  "comparisonBlock": string,',
    '  "faq": { "q": string, "a": string }[],',
    '  "engagement": {',
    '    "commentQuestions": string[],',
    '    "savePrompt": string,',
    '    "relatedLinkPlaceholders": { "label": string, "slug": string }[]',
    "  },",
    '  "imagePlan": {',
    '    "ordered": { "order": number, "groupId": number, "caption": string, "section": number, "originalIndex": number }[],',
    '    "excluded": { "originalIndex": number, "reason": string }[]',
    "  }",
    "}",
    "",
    "조건:",
    "- sections는 최소 5개.",
    "- 각 sections[].heading은 소제목 번호를 포함(예: 소제목1 …).",
    "- sections[].body는 단락을 \\n\\n으로 구분. 각 단락 안에서는 모바일 기준 약 4~6줄 이하(줄바꿈 \\n 포함)로 짧게.",
    "- 각 단락은 가능하면 「[G1] 줄바꿈 짧은 설명」처럼 사진(그룹) 직후 한 번 띄우고 글을 이어간다.",
    "- 어조는 독자에게 존댓말·친절한 설명체(~습니다/~해요). 반말·명령형 금지.",
    "- D.I.A(도입→정보→행동): 앞쪽 소제목·요약으로 제목·키워드의 약속(도입)·공감, 중앙 소제목으로 순서·비교·FAQ(정보), engagement·마지막 소제목 흐름으로 다음 행동(행동)을 명확히.",
    "- D.I.A+: 주제·키워드를 검색 의도 진입점으로 간주하고, 정보형/경험형/선택형 혼합이면 「독자가 가장 먼저 알고 싶은 한 줄」에 우선 순서와 분량을 맞춘다. 한 글 안에서 결론·비교까지 완결. 동의어·풀이 표현은 자연스러울 때만 매우 적게 사용(키워드 나열 금지).",
    "- 의도 충족·품질: 제목과 본문 모순 없음. 초행 따라 하기 가능한 수준으로 단계 주의 포함. 스니펫·메모 근거 밖 과장 금지. honestDownsides로 과장만 보완되는지 점검.",
    "- 사진 슬롯은 본문에 [G1] 형태 문자열로 표시.",
    "- imagePlan: 각 groupId별 ordered 행 개수는 반드시 2 또는 4 (2열·2×2 콜라주용).",
    "- imagePlan.ordered[].section은 sections 배열의 **0부터** 인덱스(첫 소제목=0, 둘째=1, …). 소제목 번호와 같이 1부터 쓰지 말 것.",
    "- 업로드가 8장 이상이면 ordered 장수는 8~13(업로드보다 적으면 min) 중 짝수만 가능하다(2·4장 묶음 합).",
    "- tableHtml은 근거가 있을 때만. 없으면 빈 문자열.",
    "- 공백·HTML 태그·[Gn] 마커 제외 문자 합계(제목·요약·tags·본문·FAQ 등) 최소 **" +
      MIN_BLOG_BODY_CHARS +
      "자** 미만이면 응답이 거부된다. 각 sections[].body는 단락을 여러 개 두어 분량 확보.",
    "- originalIndex는 업로드 미디어 목록의 실제 인덱스이며, 프롬프트에 제시된 허용 값만 사용.",
  ].join("\n");
}
