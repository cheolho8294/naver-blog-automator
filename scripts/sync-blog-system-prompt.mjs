import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mdPath = path.join(root, "prompts", "system.ko.md");
const claudePath = path.join(root, "lib", "claude.ts");

const s = fs.readFileSync(mdPath, "utf8");
const begin = "// <sync-blog-system-prompt-begin>";
const endMarker = "// <sync-blog-system-prompt-end>";
const replacement = `${begin}
/** 블로그 글 생성 시스템 프롬프트 — fs 미사용(Vercel). 동기화: npm run sync-blog-prompt */
export const BLOG_SYSTEM_KO_MD = ${JSON.stringify(s)};
${endMarker}
`;

let t = fs.readFileSync(claudePath, "utf8");
if (!t.includes(begin)) {
  console.error("Missing markers in lib/claude.ts — run repo setup once");
  process.exit(1);
}
const patched = t.replace(
  /\/\/ <sync-blog-system-prompt-begin>[\s\S]*?\/\/ <sync-blog-system-prompt-end>\s*/,
  `${replacement}\n`,
);
fs.writeFileSync(claudePath, patched);
console.log("updated", path.relative(root, claudePath));
