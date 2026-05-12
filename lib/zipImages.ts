export interface OrderedItem {
  order: number;
  groupId: number;
  caption: string;
  file: File;
}

function sanitize(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, "").replace(/\s+/g, "_").slice(0, 40);
}

export function buildFilename(item: OrderedItem): string {
  const extMatch = item.file.name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const safe = sanitize(item.caption) || "photo";
  return `${String(item.order).padStart(2, "0")}_G${item.groupId}_${safe}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSingle(item: OrderedItem): void {
  triggerDownload(item.file, buildFilename(item));
}

export async function downloadOrderedZip(items: OrderedItem[]): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const sorted = [...items].sort((a, b) => a.order - b.order);
  for (const it of sorted) {
    zip.file(buildFilename(it), it.file);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, "네이버블로그_사진.zip");
}
