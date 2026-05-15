import { AuthenticationError } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/** `lib/claude`에서 ANTHROPIC_API_KEY에 OpenRouter 키만 넣었을 때 */
export const OPENROUTER_KEY_IN_ANTHROPIC_SLOT = "OPENROUTER_KEY_IN_ANTHROPIC_SLOT";

const AUTH_DETAIL =
  "API 키 인증에 실패했습니다. Vercel 환경 변수를 확인하세요. OpenRouter를 쓰는 경우 OPENROUTER_API_KEY에 https://openrouter.ai 에서 발급한 키(sk-or-v1-)를 넣고 재배포하세요. Anthropic 직통을 쓰는 경우 ANTHROPIC_API_KEY에 console.anthropic.com 키(sk-ant-)를 넣습니다. 앞뒤 따옴표·공백은 빼 주세요.";

const WRONG_SLOT_DETAIL =
  "OpenRouter에서 발급한 키(sk-or-v1-)는 환경 변수 OPENROUTER_API_KEY에 넣어 주세요. ANTHROPIC_API_KEY에는 Anthropic 콘솔 전용 키만 넣거나, 빈 칸으로 두고 OPENROUTER_API_KEY만 설정하면 됩니다.";

export function anthropicEnvAuthResponse(e: unknown): NextResponse | null {
  if (e instanceof Error && e.message === OPENROUTER_KEY_IN_ANTHROPIC_SLOT) {
    return NextResponse.json({ error: "auth_failed", detail: WRONG_SLOT_DETAIL }, { status: 400 });
  }
  if (e instanceof AuthenticationError) {
    return NextResponse.json({ error: "auth_failed", detail: AUTH_DETAIL }, { status: 401 });
  }
  return null;
}
