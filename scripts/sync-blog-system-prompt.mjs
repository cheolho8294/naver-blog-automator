import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mdPath = path.join(root, "prompts", "system.ko.md");
const outPath = path.join(root, "lib", "prompts", "blogSystemKo.ts");

const s = fs.readFileSync(mdPath, "utf8");
const banner =
  "/** 네이버 블로그 글 생성용 시스템 프롬프트. prompts/system.ko.md에서 생성 — `node scripts/sync-blog-system-prompt.mjs` */\n";

fs.writeFileSync(outPath, `${banner}export const BLOG_SYSTEM_KO_MD = ${JSON.stringify(s)};\n`);
console.log("updated", path.relative(root, outPath));
