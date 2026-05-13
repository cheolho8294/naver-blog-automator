import { NextRequest, NextResponse } from "next/server";
import { generateBlogPostWithImages, type VisionMediaType } from "@/lib/claude";
import { throttle, getIp } from "@/lib/throttle";

export const runtime = "nodejs";
export const maxDuration = 60;

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
      images: { dataUrl: string; mimeType: string; originalIndex: number }[];
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
        return {
          base64,
          mediaType: img.mimeType as VisionMediaType,
          originalIndex: img.originalIndex,
        };
      });

    if (parsed.length === 0) {
      return NextResponse.json({ error: "no_valid_images" }, { status: 400 });
    }

    const result = await generateBlogPostWithImages({ ...form, images: parsed });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg.includes("JSON 파싱") ? 502 : 500;
    const code = status === 502 ? "parse_failed" : "generate_failed";
    return NextResponse.json({ error: code, detail: msg }, { status });
  }
}
