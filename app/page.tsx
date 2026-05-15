"use client";
import { useState, useMemo } from "react";
import InputForm from "@/components/InputForm";
import type { BlogPostWithImages } from "@/lib/claude";
import { formatForNaver, countChars } from "@/lib/naverFormatter";
import CopyButton from "@/components/CopyButton";
import OrderedImageList from "@/components/OrderedImageList";
import ExcludedList from "@/components/ExcludedList";

interface MediaFile {
  file: File;
  preview: string;
  caption: string;
}

type GeneratedPost = BlogPostWithImages & { researchUsed?: boolean };

export default function Home() {
  const [post, setPost] = useState<GeneratedPost | null>(null);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(data: {
    topic: string;
    keywords: string;
    notes: string;
    comparison: string;
    media: MediaFile[];
    preparedImages: { dataUrl: string; mimeType: string; originalIndex: number; caption?: string }[];
  }) {
    setLoading(true);
    setError("");
    setMedia(data.media);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form: {
            topic: data.topic,
            keywords: data.keywords,
            notes: data.notes,
            comparison: data.comparison,
          },
          images: data.preparedImages,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          typeof payload.detail === "string" ? payload.detail : "";
        const code = typeof payload.error === "string" ? payload.error : "";
        throw new Error(detail || code || "생성 실패");
      }
      setPost(payload as GeneratedPost);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("rate_limited")) {
        setError("요청이 너무 빠릅니다. 10초 후 다시 시도해주세요.");
      } else if (msg.includes("JSON 파싱") || msg.includes("parse_failed")) {
        setError("AI 응답을 읽지 못했습니다. 다시 시도해주세요.");
      } else if (msg.includes("ANTHROPIC_API_KEY") || msg.includes("no_api_key")) {
        setError("서버에 ANTHROPIC_API_KEY 가 설정되어 있지 않습니다 (.env.local).");
      } else if (msg.includes("Failed to fetch") || msg.includes("413")) {
        setError("사진 용량이 커서 전송에 실패했습니다. 2~3장 줄여 다시 시도해주세요.");
      } else {
        setError(msg || "글 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  }

  const naverHtml = post ? formatForNaver(post, post.imagePlan) : "";
  const charCount = post ? countChars(post) : 0;

  const orderedEntries = useMemo(() => {
    if (!post) return [];
    return post.imagePlan.ordered
      .map((o) => {
        const src = media[o.originalIndex];
        if (!src) return null;
        return {
          order: o.order,
          groupId: o.groupId,
          caption: o.caption,
          section: o.section,
          file: src.file,
          preview: src.preview,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [post, media]);

  const excludedEntries = useMemo(() => {
    if (!post) return [];
    return post.imagePlan.excluded
      .map((e) => {
        const src = media[e.originalIndex];
        if (!src) return null;
        return { reason: e.reason, file: src.file, preview: src.preview };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [post, media]);

  const groupCounts = useMemo(() => {
    const map = new Map<number, number>();
    if (!post) return map;
    for (const img of post.imagePlan.ordered) {
      map.set(img.groupId, (map.get(img.groupId) || 0) + 1);
    }
    return map;
  }, [post]);

  function renderBodyWithMarkers(body: string) {
    const paragraphs = body.split(/\n\n+/);
    return paragraphs.map((para, pi) => {
      const parts = para.split(/(\[G\d+\])/g);
      return (
        <p
          key={pi}
          className="whitespace-pre-line text-sm leading-relaxed text-gray-700 [&:not(:first-child)]:mt-3"
        >
          {parts.map((part, i) => {
            const match = part.match(/^\[G(\d+)\]$/);
            if (match) {
              const gid = Number(match[1]);
              const count = groupCounts.get(gid) || 0;
              return (
                <span
                  key={i}
                  className="mx-1 inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700"
                >
                  📷 그룹{gid} · {count}장
                </span>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </p>
      );
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-16 sm:px-6">
      <h1 className="mb-1 text-2xl font-black text-gray-900">네이버 블로그 자동 작성</h1>
      <p className="mb-2 text-sm leading-relaxed text-gray-500">
        세차·디테일링 전문가용 초안 생성 · 모바일/PC 브라우저 · 선택 검색(TAVILY_API_KEY)
      </p>
      <p className="mb-6 text-xs leading-relaxed text-gray-500">
        생성 후{" "}
        <a
          href="https://blog.naver.com/GoBlogWrite.naver"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-blue-600 underline"
        >
          네이버 블로그 글쓰기
        </a>
        에서 본문 HTML을 붙여넣고, 사진은 그룹 안내(2장·4장 콜라주)대로 올리면 됩니다.
      </p>

      {!post ? (
        <>
          <InputForm onSubmit={handleSubmit} loading={loading} />
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`text-sm font-bold ${
                charCount >= 1500 ? "text-green-600" : "text-red-500"
              }`}
            >
              {charCount.toLocaleString()}자 {charCount >= 1500 ? "✓" : "(1500자 미만)"}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {post.researchUsed && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                  검색 스니펫 반영됨
                </span>
              )}
              <button
                type="button"
                onClick={() => setPost(null)}
                className="text-sm text-gray-400 underline"
              >
                다시 작성
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 text-xs font-semibold text-gray-400">제목</p>
            <p className="font-bold text-gray-900">{post.title}</p>
          </div>

          {post.introSummary && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-1 text-xs font-semibold text-gray-400">한줄 요약</p>
              <p className="text-sm leading-relaxed text-gray-800">{post.introSummary}</p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold text-gray-400">태그</p>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
                >
                  #{t}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold text-gray-400">본문 미리보기</p>
            {post.sections.map((s, i) => (
              <div key={i} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
                <p className="text-[20px] font-bold leading-snug text-gray-900">{s.heading}</p>
                <div className="mt-2">{renderBodyWithMarkers(s.body)}</div>
                {s.tableHtml?.trim() && (
                  <div
                    className="mt-3 overflow-x-auto rounded-lg border border-gray-100 bg-gray-50 p-2 text-xs [&_table]:w-full [&_td]:border [&_td]:border-gray-200 [&_td]:p-2 [&_th]:border [&_th]:border-gray-200 [&_th]:p-2"
                    dangerouslySetInnerHTML={{ __html: s.tableHtml }}
                  />
                )}
              </div>
            ))}

            {post.comparisonNotes && (
              <div className="border-t pt-4">
                <p className="text-[19px] font-bold text-gray-900">소제목 — 비교 정리</p>
                <div className="mt-2 text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                  {post.comparisonNotes}
                </div>
              </div>
            )}

            {post.honestDownsides?.length === 3 && (
              <div className="border-t pt-4">
                <p className="text-[19px] font-bold text-gray-900">소제목 — 솔직한 아쉬운 점 3가지</p>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
                  {post.honestDownsides.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ol>
              </div>
            )}

            {post.faq && post.faq.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-[19px] font-bold text-gray-900">자주 묻는 질문</p>
                <div className="mt-3 space-y-3">
                  {post.faq.map((f, idx) => (
                    <div key={idx} className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs font-bold text-gray-500">Q</p>
                      <p className="text-sm text-gray-900">{f.question}</p>
                      <p className="mt-2 text-xs font-bold text-gray-500">A</p>
                      <p className="text-sm leading-relaxed text-gray-700">{f.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4 text-sm leading-relaxed text-gray-600 whitespace-pre-line">
              {post.cta}
            </div>
          </div>

          <OrderedImageList items={orderedEntries} />
          <ExcludedList items={excludedEntries} />

          <div className="flex flex-wrap gap-3">
            <CopyButton text={naverHtml} label="본문 HTML 복사" />
            <CopyButton
              text={post.sections
                .map((s) => `${s.heading}\n${s.body.replace(/\[G\d+\]/g, "")}`)
                .join("\n\n")}
              label="텍스트만 복사"
            />
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-4 text-sm leading-relaxed text-indigo-950">
            <p className="mb-2 font-bold">배포·붙여넣기 바로가기</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <a
                  href="https://blog.naver.com/GoBlogWrite.naver"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  네이버 블로그 글쓰기 열기
                </a>
                <span className="text-indigo-800"> — 로그인 후 스마트에디터에서 HTML 붙여넣기</span>
              </li>
              <li>
                <a
                  href="https://section.blog.naver.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  블로그 홈(섹션)
                </a>
                <span className="text-indigo-800"> — 글관리·예약 발행은 여기서 진행</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-indigo-900/90">
              D.I.A 구조(관심→정보→행동)와 2·4장 콜라주 안내는 생성된 HTML 안의 그룹 플레이스홀더를 참고하세요.
            </p>
          </div>

          <div className="rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
            <p className="mb-2 font-bold">📱 네이버 블로그 앱 사용법</p>
            <p>
              1. <b>본문 HTML 복사</b> → 네이버 블로그 글쓰기에 붙여넣기 (소제목 19pt 적용)
              <br />
              2. <b>📦 전체 ZIP</b>으로 사진 받기 (또는 그룹별·개별 다운로드)
              <br />
              3. 본문의 <b>[📷 그룹N · X장]</b> 위치마다 G{`{N}`}로 시작하는 파일을 순서대로 업로드
              <br />
              &nbsp;&nbsp;&nbsp;· 2장짜리 그룹: 네이버 앱의 2열 콜라주로 묶기 추천
              <br />
              &nbsp;&nbsp;&nbsp;· 4장짜리 그룹: 2x2 콜라주로 묶기 추천
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
