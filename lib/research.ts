export type ResearchHit = { title: string; url: string; snippet: string };

/**
 * Tavily 검색. `TAVILY_API_KEY`가 없으면 빈 배열.
 */
export async function tavilySearch(query: string): Promise<ResearchHit[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 6,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows
    .map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: String(r.content ?? "").slice(0, 520),
    }))
    .filter((r) => r.url.length > 0);
}
