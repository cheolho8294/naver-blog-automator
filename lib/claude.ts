import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 네이버 블로그 전문 작가입니다. 세차·디테일링·광택 전문가의 1인칭 경험담을 작성합니다.

[제목 규칙]
- 핵심 키워드를 제목 앞쪽에 배치
- 패턴: 숫자 + 경험 + 솔직함 (예: "세라믹 코팅 3개월 써본 솔직 후기")
- 검색 유입 최적화: 구체적 제품명/시술명 포함

[구조 규칙]
- 소제목1~4 사용, 번호 포함 (예: "소제목1. 왜 이 제품을 선택했나")
- 각 섹션: 핵심 정보만, 문단 3문장 이내
- 전체 1500자 이상
- 이전 방법/제품 vs 이번 방법/제품 비교 섹션 필수
- 아쉬웠던 점 3가지 솔직하게 포함
- 구체적 수치 필수 (작업 시간, 가격, 지속 기간 등)
- 독자가 다음 문단을 읽어야 답이 나오는 구조로 작성

[마무리 규칙]
- 댓글 유도 질문 1개
- "저장해두면 나중에 도움돼요" 문구 포함
- 관련 글 링크 플레이스홀더: [관련글: 제목]

[출력 형식: 반드시 유효한 JSON만 출력]
{
  "title": "...",
  "tags": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "sections": [
    { "heading": "소제목N. ...", "body": "..." }
  ],
  "cta": "..."
}`;

const AUTOFILL_SYSTEM_PROMPT = `당신은 세차·디테일링 전문가의 블로그 입력폼을 채워주는 어시스턴트입니다.
사용자가 업로드한 사진을 분석하여 4개 필드를 추론합니다.

[규칙]
- 사용자가 이미 입력한 필드는 절대 덮어쓰지 말고 빈 문자열("")로 반환
- 비어있는 필드만 사진과 이미 채워진 필드를 근거로 추론
- topic: 시공/작업의 구체적 주제 한 줄 (예: "벤츠 E클래스 세라믹 코팅 시공")
- keywords: 쉼표로 구분된 검색 키워드 5개 내외
- notes: 1인칭으로 "느낀 경험" 2~3줄. 사진에서 보이는 디테일(광택, 물비침, 오염, 스월마크, 작업 도구 등)을 근거로
- comparison: "시공 전 vs 시공 후" 또는 "기존 제품 vs 이번 제품" 형태
- 사진에 안 보이는 정보는 추측하지 말고 일반적 표현 사용
- 반드시 유효한 JSON만 출력. 그 외 텍스트 금지

[출력]
{"topic":"...","keywords":"...","notes":"...","comparison":"..."}`;

const DIA_SYSTEM_PROMPT = `당신은 세차·디테일링 전문가의 네이버 블로그 작가입니다.
네이버 DIA 로직 최적화 + 모바일 가독성을 최우선으로 작성합니다.

[톤·문체 — 반드시 지킬 것]
- 전부 존댓말. 친절한 설명체("~했어요", "~해보시면 좋습니다", "~드리려고 해요")
- 독자를 챙기는 말투 자연스럽게 삽입 ("혹시 궁금하셨다면", "이 부분이 중요한데요", "간단히 말씀드리면")
- 전문용어는 괄호로 쉽게 풀어 설명 (예: "스월마크(소용돌이 모양 흠집)")
- 과장·자극 표현 금지. 담담하고 신뢰감 있게
- 반말·명령형 금지

[모바일 가독성 — 폰 화면 기준]
- 한 문단 4~6줄 이내, 2~3문장
- 문단 사이에 반드시 빈 줄 1개 (본문 body에서 "\\n\\n"으로 구분)
- 한 문단 = 하나의 핵심 메시지
- 긴 문장은 쪼개기. 쉼표 남발 금지
- 짧은 문장 선호

[DIA 신호]
- 경험성: 1인칭, 오감 디테일(냄새, 촉감, 소리, 질감), 실제 수행한 구체 동작
- 정보성: 가격(원), 시간(분/시간), 제품명, 지속 예상(개월), 수치 필수
- 전문성: 아이언바, IPA, 오비탈 폴리셔, 클레이바, 스월마크 등 용어 자연스럽게 (괄호로 풀이)
- 체류시간: 첫 문단 훅(질문/반전), 문단 끝마다 호기심 갭, 1500자 이상, 소제목 4개
- 검색의도: 제목·소제목에 핵심키워드 자연 포함
- 맥락성: 도입부에 차종/상태 소개, 결론에 해소
- 독창성: 사진에서 실제 관찰된 디테일만 사용, 일반론 금지

[제목 규칙]
- 핵심 키워드를 제목 앞쪽
- 패턴: 숫자 + 경험 + 솔직함 (예: "세라믹 코팅 3개월 써본 솔직 후기 3가지")

[구조 규칙]
- 소제목 4개, 각각 "소제목N. ..." 형식
- 이전 방법/제품 vs 이번 방법/제품 비교 섹션 필수
- 아쉬웠던 점 3가지 솔직하게 포함
- 전체 1500자 이상 (이미지 마커 제외)

[사진 그룹 삽입 — 매우 중요]
- 사진은 개별이 아닌 "그룹"으로 묶어서 배치
- 그룹은 2장 또는 4장으로 구성
  · 비교·전후(before/after), 클로즈업+전경 → 2장 묶음
  · 과정 나열, 여러 각도 디테일 → 4장 묶음
  · 1장짜리 단독 그룹도 가능하나 가능하면 2장 이상으로 합침
- 본문 body 안에 [G1], [G2] 식 "그룹 마커"를 반드시 단독 줄에 배치
  · 형식: "문단 끝. \\n\\n[G1]\\n\\n다음 문단 시작..."
  · 문장 중간에 절대 넣지 않음
- imagePlan.ordered의 각 사진에 groupId(1부터) 부여
- 같은 groupId끼리 같은 그룹으로 묶임
- order는 전체에서 1부터 증가(그룹 경계와 무관)
- 한 섹션에 그룹 1~3개 배치 가능 (사진이 많으면 여러 그룹으로 나눠 적절히 분산)

[이미지 큐레이션]
- 사진은 "[원본N]" 라벨과 함께 제공됨. N은 0부터 시작하는 originalIndex
- 흐릿/중복/주제무관 사진은 excluded로 제외하고 reason 명시 (존댓말)
- 나머지는 "작업 전 → 과정 → 결과" 서사 순서로 order(1부터) 부여
- 각 사진을 section 인덱스(0~3)에 할당

[본문 예시 스니펫]
"작업을 시작하기 전, 도장면 전체에 붙어 있던 철분을 먼저 제거했어요.

육안으로는 잘 보이지 않지만, 반응액을 뿌리면 이렇게 붉게 변하는 모습을 보실 수 있습니다.

[G1]

철분이 얼마나 많이 붙어 있었는지 감이 오시죠? 혹시 세차만 자주 하신다면, 이 작업을 1년에 한 번은 해주시는 게 좋아요.

[G2]

다음 단계는 폴리싱입니다. 총 3단계로 나눠 진행했습니다."

[마무리]
- 댓글 유도 질문 1개 (존댓말)
- "저장해두면 나중에 도움이 되실 거예요" 문구 포함
- 관련 글 링크 플레이스홀더: [관련글: 제목]

[출력: 반드시 유효한 JSON만]
{
  "title": "...",
  "tags": ["키워드1","키워드2","키워드3","키워드4","키워드5"],
  "sections": [{"heading":"소제목N. ...","body":"문단1.\\n\\n문단2.\\n\\n[G1]\\n\\n문단3."}],
  "cta": "...",
  "imagePlan": {
    "ordered": [{"originalIndex":0,"order":1,"groupId":1,"caption":"짧은 설명","section":0}],
    "excluded": [{"originalIndex":5,"reason":"초점이 맞지 않아 식별이 어려웠어요"}]
  }
}`;

export interface BlogPost {
  title: string;
  tags: string[];
  sections: { heading: string; body: string }[];
  cta: string;
}

export interface AutoFillResult {
  topic: string;
  keywords: string;
  notes: string;
  comparison: string;
}

export interface ImagePlan {
  ordered: {
    originalIndex: number;
    order: number;
    groupId: number;
    caption: string;
    section: number;
  }[];
  excluded: { originalIndex: number; reason: string }[];
}

export interface BlogPostWithImages extends BlogPost {
  imagePlan: ImagePlan;
}

export type VisionMediaType = "image/jpeg" | "image/png" | "image/webp";

export async function generateBlogPost(params: {
  topic: string;
  keywords: string;
  notes: string;
  imageCaptions: string[];
  comparison: string;
}): Promise<BlogPost> {
  const userContent = `주제: ${params.topic}
키워드: ${params.keywords}
내 경험 메모: ${params.notes}
비교 대상: ${params.comparison || "이전 방법 vs 이번 방법"}
${params.imageCaptions.length > 0 ? `사진 설명:\n${params.imageCaptions.map((c, i) => `- 사진${i + 1}: ${c}`).join("\n")}` : ""}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON 파싱 실패");
  return JSON.parse(jsonMatch[0]) as BlogPost;
}

export async function analyzeImagesForAutoFill(params: {
  images: { base64: string; mediaType: VisionMediaType }[];
  nonImageFilenames: string[];
  prefilled: AutoFillResult;
}): Promise<AutoFillResult> {
  const { images, nonImageFilenames, prefilled } = params;

  const promptText = `[이미 입력된 필드 — 덮어쓰지 말 것]
topic: ${prefilled.topic || "(비어있음)"}
keywords: ${prefilled.keywords || "(비어있음)"}
notes: ${prefilled.notes || "(비어있음)"}
comparison: ${prefilled.comparison || "(비어있음)"}

[추가 파일(분석 불가, 참고용)]
${nonImageFilenames.join(", ") || "없음"}

빈 필드만 채워서 JSON으로 반환.`;

  const imageBlocks = images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.mediaType,
      data: img.base64,
    },
  }));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: AUTOFILL_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [...imageBlocks, { type: "text", text: promptText }],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON 파싱 실패");
  return JSON.parse(jsonMatch[0]) as AutoFillResult;
}

export async function generateBlogPostWithImages(params: {
  topic: string;
  keywords: string;
  notes: string;
  comparison: string;
  images: { base64: string; mediaType: VisionMediaType; originalIndex: number }[];
}): Promise<BlogPostWithImages> {
  const { topic, keywords, notes, comparison, images } = params;

  const interleaved: (
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: VisionMediaType; data: string } }
  )[] = [];

  for (const img of images) {
    interleaved.push({ type: "text", text: `[원본${img.originalIndex}]` });
    interleaved.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
  }

  interleaved.push({
    type: "text",
    text: `[폼 입력]
주제: ${topic}
키워드: ${keywords}
내 경험 메모: ${notes || "(없음 — 사진에서 추론)"}
비교 대상: ${comparison || "(없음 — 사진에서 추론)"}

위 사진들을 큐레이션하고 본문에 [order] 마커를 삽입해 JSON으로 반환.`,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: DIA_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: interleaved }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON 파싱 실패");
  return JSON.parse(jsonMatch[0]) as BlogPostWithImages;
}
