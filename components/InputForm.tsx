"use client";
import { useState, useRef } from "react";
import imageCompression from "browser-image-compression";

interface MediaFile {
  file: File;
  preview: string;
  caption: string;
}

interface FormData {
  topic: string;
  keywords: string;
  notes: string;
  comparison: string;
  media: MediaFile[];
  preparedImages: { dataUrl: string; mimeType: string; originalIndex: number }[];
}

interface Props {
  onSubmit: (data: FormData) => void;
  loading: boolean;
}

const VISION_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGES = 20;
const PAYLOAD_BUDGET = 3.8 * 1024 * 1024; // Vercel 4.5MB 한도 안전 마진
const COMPRESS_OPTS = {
  maxSizeMB: 0.2,
  maxWidthOrHeight: 1024,
  fileType: "image/webp",
  useWebWorker: true,
  initialQuality: 0.8,
};

function isStaticImage(file: File) {
  return VISION_TYPES.includes(file.type);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function InputForm({ onSubmit, loading }: Props) {
  const [form, setForm] = useState({ topic: "", keywords: "", notes: "", comparison: "" });
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillError, setAutoFillError] = useState("");
  const [autoFillWarning, setAutoFillWarning] = useState("");
  const [submitWarning, setSubmitWarning] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    const newMedia: MediaFile[] = [];
    for (const file of Array.from(files)) {
      const compressed = file.type.startsWith("image/") && file.type !== "image/gif"
        ? await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200 })
        : file;
      newMedia.push({
        file: compressed,
        preview: URL.createObjectURL(compressed),
        caption: "",
      });
    }
    setMedia((prev) => [...prev, ...newMedia]);
  }

  function updateCaption(i: number, caption: string) {
    setMedia((prev) => prev.map((m, idx) => (idx === i ? { ...m, caption } : m)));
  }

  function removeMedia(i: number) {
    setMedia((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleAutoFill() {
    setAutoFillError("");
    setAutoFillWarning("");
    const staticImages = media.filter((m) => isStaticImage(m.file));
    if (staticImages.length === 0) {
      setAutoFillError("정적 이미지(JPEG/PNG/WebP)를 먼저 업로드하세요.");
      return;
    }

    const warnings: string[] = [];
    let selected = staticImages;
    if (selected.length > MAX_IMAGES) {
      warnings.push(`사진이 많아 앞 ${MAX_IMAGES}장만 분석합니다 (총 ${selected.length}장).`);
      selected = selected.slice(0, MAX_IMAGES);
    }

    setAutoFilling(true);
    try {
      const prepared: { dataUrl: string; mimeType: string; filename: string }[] = [];
      let totalBytes = 0;
      for (const m of selected) {
        const compressed = await imageCompression(m.file, COMPRESS_OPTS);
        const dataUrl = await fileToDataUrl(compressed);
        totalBytes += dataUrl.length;
        prepared.push({ dataUrl, mimeType: compressed.type, filename: m.file.name });
      }

      if (prepared.length === 0) {
        setAutoFillError("분석 가능한 사진이 없습니다.");
        setAutoFilling(false);
        return;
      }
      if (totalBytes > PAYLOAD_BUDGET) {
        setAutoFillError(
          `사진 합계 용량(${(totalBytes / 1024 / 1024).toFixed(1)}MB)이 전송 한도를 넘었어요. 2~3장 빼고 다시 시도해주세요.`
        );
        setAutoFilling(false);
        return;
      }

      const nonImageFilenames = media
        .filter((m) => !isStaticImage(m.file))
        .map((m) => m.file.name);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: prepared, nonImageFilenames, prefilled: form }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === "parse_failed") {
          setAutoFillError("사진 분석 결과를 읽지 못했습니다. 다시 시도해주세요.");
        } else if (err.error === "rate_limited") {
          setAutoFillError("요청이 너무 빠릅니다. 10초 후 다시 시도해주세요.");
        } else {
          setAutoFillError("자동 채우기 실패. 다시 시도해주세요.");
        }
        return;
      }

      const r = (await res.json()) as typeof form;
      setForm((f) => ({
        topic: f.topic || r.topic || "",
        keywords: f.keywords || r.keywords || "",
        notes: f.notes || r.notes || "",
        comparison: f.comparison || r.comparison || "",
      }));
      if (warnings.length > 0) setAutoFillWarning(warnings.join(" "));
    } catch {
      setAutoFillError("자동 채우기 중 오류가 발생했습니다.");
    } finally {
      setAutoFilling(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitWarning("");

    const staticImages = media
      .map((m, originalIndex) => ({ m, originalIndex }))
      .filter(({ m }) => isStaticImage(m.file));

    if (staticImages.length === 0) {
      setSubmitWarning("정적 이미지(JPEG/PNG/WebP)를 1장 이상 업로드하세요.");
      return;
    }

    const warnings: string[] = [];
    let selected = staticImages;
    if (selected.length > MAX_IMAGES) {
      warnings.push(`사진이 많아 앞 ${MAX_IMAGES}장만 사용합니다 (총 ${selected.length}장).`);
      selected = selected.slice(0, MAX_IMAGES);
    }

    const preparedImages: { dataUrl: string; mimeType: string; originalIndex: number }[] = [];
    let totalBytes = 0;
    for (const { m, originalIndex } of selected) {
      const compressed = await imageCompression(m.file, COMPRESS_OPTS);
      const dataUrl = await fileToDataUrl(compressed);
      totalBytes += dataUrl.length;
      preparedImages.push({ dataUrl, mimeType: compressed.type, originalIndex });
    }

    if (preparedImages.length === 0) {
      setSubmitWarning("전송 가능한 사진이 없습니다.");
      return;
    }
    if (totalBytes > PAYLOAD_BUDGET) {
      setSubmitWarning(
        `사진 합계 용량(${(totalBytes / 1024 / 1024).toFixed(1)}MB)이 전송 한도를 넘었어요. 사진을 2~3장 빼고 다시 시도해주세요.`
      );
      return;
    }

    if (warnings.length > 0) setSubmitWarning(warnings.join(" "));
    onSubmit({ ...form, media, preparedImages });
  }

  const inputCls = "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none";
  const hasStaticImage = media.some((m) => isStaticImage(m.file));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">주제 *</label>
        <input
          className={inputCls}
          placeholder="예: 세라믹 코팅 시공 후기"
          value={form.topic}
          onChange={(e) => setForm({ ...form, topic: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">핵심 키워드 *</label>
        <input
          className={inputCls}
          placeholder="예: 세라믹코팅, 광택, 디테일링"
          value={form.keywords}
          onChange={(e) => setForm({ ...form, keywords: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">내 경험 메모</label>
        <textarea
          className={`${inputCls} min-h-[120px] resize-none`}
          placeholder="작업 과정, 느낀 점, 특이사항 등 자유롭게 적어주세요"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">비교 대상</label>
        <input
          className={inputCls}
          placeholder="예: 기존 왁스 vs 이번 세라믹 코팅"
          value={form.comparison}
          onChange={(e) => setForm({ ...form, comparison: e.target.value })}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-gray-700">사진 / 영상 / GIF</label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-gray-300 py-6 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500"
        >
          + 파일 추가 (카메라 촬영 가능)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,image/gif"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {media.length > 0 && (
          <div className="mt-3 space-y-3">
            {media.map((m, i) => (
              <div key={i} className="flex gap-3 rounded-xl bg-gray-50 p-3">
                {m.file.type.startsWith("image/") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                )}
                <div className="flex flex-1 flex-col gap-1">
                  <input
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
                    placeholder="사진 설명 (선택)"
                    value={m.caption}
                    onChange={(e) => updateCaption(i, e.target.value)}
                  />
                  <span className="text-xs text-gray-400">{m.file.name}</span>
                </div>
                <button type="button" onClick={() => removeMedia(i)} className="text-gray-400 hover:text-red-500">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={handleAutoFill}
          disabled={autoFilling || !hasStaticImage}
          className="w-full rounded-xl border-2 border-purple-300 bg-purple-50 py-3 text-sm font-bold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
        >
          {autoFilling ? "🪄 사진 분석 중..." : "🪄 AI 자동 채우기 (사진 분석)"}
        </button>
        {!hasStaticImage && (
          <p className="text-xs text-gray-400">정적 이미지(JPEG/PNG/WebP)를 먼저 업로드하세요.</p>
        )}
        {autoFillWarning && <p className="text-xs text-amber-600">{autoFillWarning}</p>}
        {autoFillError && <p className="text-xs text-red-500">{autoFillError}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-blue-600 py-4 text-base font-bold text-white disabled:opacity-50"
      >
        {loading ? "글 생성 중... (40~60초)" : "✍️ 블로그 글 생성하기"}
      </button>
      {submitWarning && <p className="text-xs text-amber-600">{submitWarning}</p>}
    </form>
  );
}
