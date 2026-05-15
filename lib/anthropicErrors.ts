import { AuthenticationError } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/** `lib/claude`에서 의도적으로 던져 라우트가 한국어 안내를 내릴 때 사용 */
export const OPENROUTER_KEY_IN_ANTHROPIC_SLOT = "OPENROUTER_KEY_IN_ANTHROPIC_SLOT";

const AUTH_DETAIL =
  "Anthropic API 키가 올바르지 않거나 만료되었습니다. Vercel 프로젝트 → Settings → Environment Variables에서 변수 이름은 정확히 ANTHROPIC_API_KEY 인지 확인하고, 값은 앞뒤 따옴표·공백 없이 저장한 뒤 재배포하세요. https://console.anthropic.com 에서 새 키(sk-ant-로 시작하는 Claude API 키)를 발급해 넣어 주세요.";

const MIXED_PROVIDER_DETAIL =
  "ANTHROPIC_API_KEY 변수에 OpenRouter 키(sk-or-v1-로 시작)가 들어 있습니다. 지금 코드는 Claude 공식 엔드포인트(https://api.anthropic.com)만 사용하므로, Anthropic 대시보드에서 발급한 API 키를 이 변수에 넣어야 합니다.";

export function anthropicEnvAuthResponse(e: unknown): NextResponse | null {
  if (e instanceof Error && e.message === OPENROUTER_KEY_IN_ANTHROPIC_SLOT) {
    return NextResponse.json({ error: "auth_failed", detail: MIXED_PROVIDER_DETAIL }, { status: 400 });
  }
  if (e instanceof AuthenticationError) {
    return NextResponse.json({ error: "auth_failed", detail: AUTH_DETAIL }, { status: 401 });
  }
  return null;
}
