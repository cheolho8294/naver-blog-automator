"use client";
import { downloadSingle, downloadOrderedZip, type OrderedItem } from "@/lib/zipImages";

interface OrderedEntry {
  order: number;
  groupId: number;
  caption: string;
  section: number;
  file: File;
  preview: string;
}

export default function OrderedImageList({ items }: { items: OrderedEntry[] }) {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const orderedItems: OrderedItem[] = sorted.map((i) => ({
    order: i.order,
    groupId: i.groupId,
    caption: i.caption,
    file: i.file,
  }));

  const groupIds = Array.from(new Set(sorted.map((s) => s.groupId))).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400">
          📸 순서대로 블로그에 올릴 사진 ({sorted.length}장 · {groupIds.length}개 그룹)
        </p>
        <button
          onClick={() => downloadOrderedZip(orderedItems)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
        >
          📦 전체 ZIP
        </button>
      </div>

      <div className="space-y-4">
        {groupIds.map((gid) => {
          const group = sorted.filter((s) => s.groupId === gid);
          const section = group[0]?.section ?? 0;
          return (
            <div
              key={gid}
              className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-blue-700">
                  그룹{gid} · {group.length}장 · 소제목{section + 1}
                </p>
                <button
                  onClick={() =>
                    downloadOrderedZip(
                      group.map((i) => ({
                        order: i.order,
                        groupId: i.groupId,
                        caption: i.caption,
                        file: i.file,
                      }))
                    )
                  }
                  className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                >
                  그룹만 ZIP
                </button>
              </div>

              <div className="space-y-2">
                {group.map((it) => (
                  <div
                    key={it.order}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white">
                      {String(it.order).padStart(2, "0")}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.preview}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-gray-800">{it.caption}</p>
                    </div>
                    <button
                      onClick={() =>
                        downloadSingle({
                          order: it.order,
                          groupId: it.groupId,
                          caption: it.caption,
                          file: it.file,
                        })
                      }
                      className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      ⬇
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
