import { NextRequest, NextResponse } from "next/server";
import { generateBlogPostWithImages, type VisionMediaType } from "@/lib/claude";
import { throttle, getIp } from "@/lib/throttle";
import { tavilySearch } from "@/lib/research";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED: VisionMediaType[] = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: NextRequest) {
  if (throttle(getIp(req.headers))) {
    return NextResponse.json(
      { error: "rate_limited", detail: "10초 후 다시 시도해주세요." },
      { status: 429 }
    );
  }
  try {
    const body = await req.json();
    const { form, images } = body as {
      form: { topic: string; keywords: string; notes: string; comparison: string };
      images: { dataUrl: string; mimeType: string; originalIndex: number; caption?: string }[];
    };

    if (!form?.topic || !form?.keywords) {
      return NextResponse.json({ error: "missing_form" }, { status: 400 });
    }
    if (!images || images.length === 0) {
      return NextResponse.json({ error: "no_images" }, { status: 400 });
    }

    const parsed = images
      .filter((img) => ALLOWED.includes(img.mimeType as VisionMediaType))
      .slice(0, 20)
      .map((img) => {
        const comma = img.dataUrl.indexOf(",");
        const base64 = comma >= 0 ? img.dataUrl.slice(comma + 1) : img.dataUrl;
        const cap = typeof img.caption === "string" ? img.caption.trim() : "";
        return {
          base64,
          mediaType: img.mimeType as VisionMediaType,
          originalIndex: img.originalIndex,
          ...(cap ? { caption: cap } : {}),
        };
      })
      .sort((a, b) => a.originalIndex - b.originalIndex);

    if (parsed.length === 0) {
      return NextResponse.json({ error: "no_valid_images" }, { status: 400 });
    }

    const allowedOriginalIndices = parsed.map((p) => p.originalIndex);
    const visionImages = parsed.map((p) => ({
      base64: p.base64,
      mediaType: p.mediaType,
      originalIndex: p.originalIndex,
      caption: p.caption,
    }));

    let researchHits: { title: string; url: string; snippet: string }[] = [];
    try {
      const q = `${form.topic} ${form.keywords}`.trim();
      researchHits = await tavilySearch(q);
    } catch {
      researchHits = [];
    }

    const result = await generateBlogPostWithImages({
      form,
      images: visionImages,
      allowedOriginalIndices,
      researchHits,
    });

    return NextResponse.json({ ...result, researchUsed: researchHits.length > 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status =
      msg.includes("JSON 파싱") || msg.includes("JSON 검증") ? 502 : 500;
    const code =
      status === 502 ? "parse_failed" : msg.includes("ANTHROPIC_API_KEY") ? "no_api_key" : "generate_failed";
    return NextResponse.json({ error: code, detail: msg }, { status });
  }
}
