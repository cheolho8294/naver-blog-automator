const WINDOW_MS = 10_000;
const lastCall = new Map<string, number>();

export function throttle(ip: string): boolean {
  const now = Date.now();
  const prev = lastCall.get(ip) ?? 0;
  if (now - prev < WINDOW_MS) return true;
  lastCall.set(ip, now);
  // 맵이 너무 커지지 않게 주기적 정리
  if (lastCall.size > 500) {
    for (const [k, t] of lastCall) {
      if (now - t > WINDOW_MS * 6) lastCall.delete(k);
    }
  }
  return false;
}

export function getIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    headers.get("x-real-ip") ??
    "anon"
  );
}
