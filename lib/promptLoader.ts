import fs from "fs";
import path from "path";

export function loadUtf8FromRoot(rel: string): string {
  const full = path.join(/* turbopackIgnore: true */ process.cwd(), rel);
  return fs.readFileSync(full, "utf8");
}
