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

export default function Home() {
  const [post, setPost] = useState<BlogPostWithImages | null>(null);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(data: {
    topic: string;
    keywords: string;
    notes: string;
    comparison: string;
    media: MediaFile[];
    preparedImages: { dataUrl: string; mimeType: string; originalIndex: number }[];
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "생성 실패");
      }
      setPost(await res.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg === "parse_failed"
          ? "AI 응답을 읽지 못했습니다. 다시 시도해주세요."
          : "글 생성 중 오류가 발생했습니다. 다시 시도해주세요."
      );
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
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-black text-gray-900">네이버 블로그 자동 작성</h1>
      <p className="mb-6 text-sm text-gray-500">
        세차·디테일링 전문가용 AI 블로그 · DIA 최적화
      </p>

      {!post ? (
        <>
          <InputForm onSubmit={handleSubmit} loading={loading} />
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-bold ${
                charCount >= 1500 ? "text-green-600" : "text-red-500"
              }`}
            >
              {charCount.toLocaleString()}자 {charCount >= 1500 ? "✓" : "(1500자 미만)"}
            </span>
            <button
              onClick={() => setPost(null)}
              className="text-sm text-gray-400 underline"
            >
              다시 작성
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 text-xs font-semibold text-gray-400">제목</p>
            <p className="font-bold text-gray-900">{post.title}</p>
          </div>

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

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400">본문 미리보기 (폰 가독성 기준)</p>
            {post.sections.map((s, i) => (
              <div key={i}>
                <p className="text-[19px] font-bold leading-snug text-gray-900">{s.heading}</p>
                <div className="mt-2">{renderBodyWithMarkers(s.body)}</div>
              </div>
            ))}
            <div className="border-t pt-3 text-sm leading-relaxed text-gray-600">{post.cta}</div>
          </div>

          <OrderedImageList items={orderedEntries} />
          <ExcludedList items={excludedEntries} />

          <div className="flex gap-3 flex-wrap">
            <CopyButton text={naverHtml} label="본문 HTML 복사" />
            <CopyButton
              text={post.sections
                .map((s) => `${s.heading}\n${s.body.replace(/\[G\d+\]/g, "")}`)
                .join("\n\n")}
              label="텍스트만 복사"
            />
          </div>

          <div className="rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
            <p className="mb-2 font-bold">📱 네이버 블로그 앱 사용법</p>
            <p>
              1. <b>본문 HTML 복사</b> → 네이버 블로그 글쓰기에 붙여넣기 (소제목 19pt·존댓말 적용됨)
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
