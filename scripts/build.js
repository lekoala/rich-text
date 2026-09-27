import { copyFileSync, mkdirSync } from "node:fs";

const { version } = await Bun.file("package.json").json();
const BANNER = `/*** @lekoala/rich-text v${version} - https://github.com/lekoala/rich-text ***/`;

mkdirSync("dist", { recursive: true });

async function bundle(entry, outfile, minify, options = {}) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: "dist",
    naming: outfile,
    target: "browser",
    format: "iife",
    minify,
    ...options,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const file = Bun.file(`dist/${outfile}`);
  await Bun.write(`dist/${outfile}`, `${BANNER}\n${await file.text()}`);
}

await bundle("src/define.js", "rich-text.js", false);
await bundle("src/define.js", "rich-text.min.js", true);
await bundle("scripts/standalone.js", "rich-text.standalone.min.js", true, {
  loader: { ".css": "text" },
});

copyFileSync("src/rich-text.css", "dist/rich-text.css");
const cssResult = await Bun.build({
  entrypoints: ["src/rich-text.css"],
  outdir: "dist",
  naming: "rich-text.min.css",
  minify: true,
});
if (!cssResult.success) {
  for (const log of cssResult.logs) console.error(log);
  process.exit(1);
}
