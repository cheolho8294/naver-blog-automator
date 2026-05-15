import type { BlogPost, BlogPostWithImages, ImagePlan } from "./claude";

const GROUP_MARKER_RE = /\[G(\d+)\]/g;

const BODY_WRAP_OPEN = `<span style="font-size:11pt;line-height:1.74;color:#111">`;
const BODY_WRAP_CLOSE = `</span>`;

function renderGroupPlaceholder(groupId: number, count: number): string {
  const layout =
    count === 2 ? "앱에서 2열 콜라주 추천" : count === 4 ? "앱에서 2×2 콜라주 추천" : "콜라주 배치";
  return `<br><br><i>[📷 그룹${groupId} — 사진 ${count}장 · ${layout}]</i><br><br>`;
}

/** 제목: 소제목보다 1pt 크게 */
function renderTitleHeading(heading: string): string {
  return `<b><span style="font-size:21pt;line-height:1.34">${heading}</span></b>`;
}

/** 소제목: 기존 19pt 대비 +1pt */
function renderSectionHeading(heading: string): string {
  return `<b><span style="font-size:20pt;line-height:1.38">${heading}</span></b>`;
}

function renderBody(body: string): string {
  const html = body.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
  return `${BODY_WRAP_OPEN}${html}${BODY_WRAP_CLOSE}`;
}

function groupCountMap(plan?: ImagePlan): Map<number, number> {
  const map = new Map<number, number>();
  if (!plan) return map;
  for (const img of plan.ordered) {
    map.set(img.groupId, (map.get(img.groupId) || 0) + 1);
  }
  return map;
}

export function formatForNaver(post: BlogPost, imagePlan?: ImagePlan): string {
  const lines: string[] = [];
  const counts = groupCountMap(imagePlan);
  const placed = new Set<number>();

  lines.push(renderTitleHeading(post.title), "<br><br>");

  if (post.introSummary?.trim()) {
    lines.push(
      "<b>한줄 요약</b><br>",
      renderBody(post.introSummary.trim()),
      "<br><br>"
    );
  }

  for (let i = 0; i < post.sections.length; i++) {
    const sec = post.sections[i];
    const { heading, body } = sec;
    lines.push(renderSectionHeading(heading), "<br>");

    const replacedBody = renderBody(body).replace(GROUP_MARKER_RE, (_m, num) => {
      const gid = Number(num);
      placed.add(gid);
      const count = counts.get(gid) || 0;
      return renderGroupPlaceholder(gid, count);
    });
    lines.push(replacedBody, "<br><br>");

    if (sec.tableHtml?.trim()) {
      lines.push(sec.tableHtml.trim(), "<br><br>");
    }

    if (imagePlan) {
      const missingGroups = Array.from(
        new Set(
          imagePlan.ordered
            .filter((img) => img.section === i && !placed.has(img.groupId))
            .map((img) => img.groupId)
        )
      ).sort((a, b) => a - b);
      for (const gid of missingGroups) {
        lines.push(renderGroupPlaceholder(gid, counts.get(gid) || 0));
        placed.add(gid);
      }
    }
  }

  if (post.comparisonNotes?.trim()) {
    lines.push(
      renderSectionHeading("소제목 — 이전 방식과 이번 방식 비교"),
      "<br>",
      renderBody(post.comparisonNotes.trim()),
      "<br><br>"
    );
  }

  if (post.honestDownsides?.length === 3) {
    lines.push(renderSectionHeading("소제목 — 솔직한 아쉬운 점 3가지"), "<br>");
    post.honestDownsides.forEach((t, idx) => {
      lines.push(`<b>${idx + 1}.</b> ${renderBody(t)}<br><br>`);
    });
  }

  if (post.faq?.length) {
    lines.push(renderSectionHeading("자주 묻는 질문"), "<br>");
    for (const f of post.faq) {
      lines.push("<b>Q.</b> ", renderBody(f.question), "<br>");
      lines.push("<b>A.</b> ", renderBody(f.answer), "<br><br>");
    }
  }

  if (imagePlan) {
    const trailing = Array.from(
      new Set(imagePlan.ordered.map((img) => img.groupId))
    )
      .filter((gid) => !placed.has(gid))
      .sort((a, b) => a - b);
    for (const gid of trailing) {
      lines.push(renderGroupPlaceholder(gid, counts.get(gid) || 0));
    }
  }

  lines.push("<br>", renderBody(post.cta), "<br><br>");
  lines.push(`태그: ${post.tags.map((t) => `#${t}`).join(" ")}`);
  return lines.join("\n");
}

export function countChars(post: BlogPost): number {
  const stripped = [
    post.title,
    post.introSummary ?? "",
    (post.tags ?? []).join(""),
    ...post.sections.map(
      (s) =>
        s.heading +
        s.body.replace(GROUP_MARKER_RE, "") +
        (s.tableHtml?.replace(/<[^>]+>/g, "") ?? "")
    ),
    post.comparisonNotes ?? "",
    ...(post.honestDownsides ?? []).join(""),
    ...(post.faq ?? []).map((f) => f.question + f.answer).join(""),
    post.cta,
  ].join("");
  return stripped.replace(/\s/g, "").length;
}

export function hasImagePlan(post: BlogPost | BlogPostWithImages): post is BlogPostWithImages {
  return (post as BlogPostWithImages).imagePlan !== undefined;
}
