import type { BlogPost, BlogPostWithImages, ImagePlan } from "./claude";

const GROUP_MARKER_RE = /\[G(\d+)\]/g;

function renderGroupPlaceholder(groupId: number, count: number): string {
  return `<br><i>[📷 그룹${groupId} — 사진 ${count}장]</i><br>`;
}

function renderHeading(heading: string): string {
  return `<b><span style="font-size:19pt">${heading}</span></b>`;
}

function renderBody(body: string): string {
  // 문단 구분(\n\n)을 <br><br>로 유지, 단일 줄바꿈(\n)도 <br>로
  return body.replace(/\n\n/g, "<br><br>").replace(/\n/g, "<br>");
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

  lines.push(renderHeading(post.title), "<br><br>");

  for (let i = 0; i < post.sections.length; i++) {
    const { heading, body } = post.sections[i];
    lines.push(renderHeading(heading), "<br>");

    const replacedBody = renderBody(body).replace(GROUP_MARKER_RE, (_m, num) => {
      const gid = Number(num);
      placed.add(gid);
      const count = counts.get(gid) || 0;
      return renderGroupPlaceholder(gid, count);
    });
    lines.push(replacedBody, "<br><br>");

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

  lines.push("<br>", post.cta, "<br><br>");
  lines.push(`태그: ${post.tags.map((t) => `#${t}`).join(" ")}`);
  return lines.join("\n");
}

export function countChars(post: BlogPost): number {
  const stripped = [
    post.title,
    ...post.sections.map((s) => s.heading + s.body.replace(GROUP_MARKER_RE, "")),
    post.cta,
  ].join("");
  return stripped.length;
}

export function hasImagePlan(post: BlogPost | BlogPostWithImages): post is BlogPostWithImages {
  return (post as BlogPostWithImages).imagePlan !== undefined;
}
