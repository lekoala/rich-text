import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npmCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const npmArgs =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npm pack --dry-run --json"]
    : ["pack", "--dry-run", "--json"];
const raw = execFileSync(npmCommand, npmArgs, { encoding: "utf8" });
const start = raw.indexOf("[");
const end = raw.lastIndexOf("]");
if (start < 0 || end < 0) throw new Error("npm pack did not produce JSON");
const [result] = JSON.parse(raw.slice(start, end + 1));
const paths = result.files.map((file) => file.path);
const has = (path) => paths.includes(path);
const errors = [];

for (const path of [
  "src/index.js",
  "src/rich-text.js",
  "src/rich-text-element.js",
  "src/rich-text.css",
  "src/define.js",
  "dist/rich-text.js",
  "dist/rich-text.min.js",
  "dist/rich-text.standalone.min.js",
  "dist/rich-text.css",
  "dist/rich-text.min.css",
  "dist/types/index.d.ts",
  "README.md",
  "LICENSE",
]) {
  if (!has(path)) errors.push(`missing from package: ${path}`);
}

for (const prefix of ["test/", "demo/", "scripts/", ".github/"]) {
  if (paths.some((path) => path.startsWith(prefix))) errors.push(`unexpected dev files under ${prefix}`);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
function targets(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(targets);
}
for (const [key, value] of Object.entries(pkg.exports ?? {})) {
  if (key.includes("*")) continue;
  for (const target of targets(value)) {
    const path = target.replace(/^\.\//, "");
    if (!has(path)) errors.push(`exports[${key}] -> ${target} missing`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`package ok: ${paths.length} files`);
