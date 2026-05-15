import { NextRequest, NextResponse } from "next/server";
import { anthropicEnvAuthResponse } from "@/lib/anthropicErrors";
import { analyzeImagesForAutoFill, type VisionMediaType } from "@/lib/claude";
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
    const {
      images,
      nonImageFilenames = [],
      prefilled: prefilledRaw,
    } = body as {
      images?: { dataUrl: string; mimeType: string; filename: string; caption?: string }[];
      nonImageFilenames?: string[];
      prefilled?: { topic?: string; keywords?: string; notes?: string; comparison?: string };
    };

    const prefilled = {
      topic: prefilledRaw?.topic ?? "",
      keywords: prefilledRaw?.keywords ?? "",
      notes: prefilledRaw?.notes ?? "",
      comparison: prefilledRaw?.comparison ?? "",
    };

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "no_images" }, { status: 400 });
    }

    const parsed = images
      .filter((img) => ALLOWED.includes(img.mimeType as VisionMediaType))
      .map((img) => {
        const comma = img.dataUrl.indexOf(",");
        const base64 = comma >= 0 ? img.dataUrl.slice(comma + 1) : img.dataUrl;
        const cap = typeof img.caption === "string" ? img.caption.trim() : "";
        return { base64, mediaType: img.mimeType as VisionMediaType, caption: cap || undefined };
      });

    if (parsed.length === 0) {
      return NextResponse.json({ error: "no_valid_images" }, { status: 400 });
    }

    const result = await analyzeImagesForAutoFill({
      images: parsed,
      nonImageFilenames,
      prefilled,
    });
    return NextResponse.json(result);
  } catch (e) {
    const authRes = anthropicEnvAuthResponse(e);
    if (authRes) return authRes;

    const msg = e instanceof Error ? e.message : "unknown";
    if (msg.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json(
        {
          error: "no_api_key",
          detail:
            "서버에 ANTHROPIC_API_KEY 가 없습니다. 프로젝트 폴더에 .env.local 파일을 만들고 ANTHROPIC_API_KEY=your_key 를 넣은 뒤 개발 서버를 다시 실행하세요.",
        },
        { status: 503 }
      );
    }
    const status =
      msg.includes("JSON 파싱") || msg.includes("자동 채우기 JSON") ? 502 : 500;
    const code =
      status === 502 ? "parse_failed" : msg.includes("401") ? "auth_failed" : "analyze_failed";
    const detail =
      code === "auth_failed"
        ? "API 인증 오류입니다. Vercel의 ANTHROPIC_API_KEY(Anthropic 콘솔에서 발급한 sk-ant- 키)를 확인 후 재배포하세요."
        : msg;
    return NextResponse.json({ error: code, detail }, { status });
  }
}
