"use client";

interface ExcludedEntry {
  reason: string;
  file: File;
  preview: string;
}

export default function ExcludedList({ items }: { items: ExcludedEntry[] }) {
  if (items.length === 0) return null;

  return (
    <details className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-gray-500">
        🗑 제외된 사진 {items.length}장 보기
      </summary>
      <div className="mt-3 space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.preview}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover opacity-40 grayscale"
            />
            <p className="text-xs text-gray-600">{it.reason}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
