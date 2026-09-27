import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4174);
const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);
const IMPORT_MAP = `<script type="importmap">${JSON.stringify({
  imports: {
    "squire-rte": "/node_modules/squire-rte/dist/squire.mjs",
    dompurify: "/node_modules/dompurify/dist/purify.es.mjs",
    "@lekoala/floating": "/node_modules/@lekoala/floating/src/floating.js",
  },
})}</script>`;

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/demo/index.html" : url.pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end("Forbidden");

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": types.get(path.extname(file)) || "application/octet-stream" });
    if (path.extname(file) === ".html") {
      const html = await readFile(file, "utf8");
      response.end(html.replace(/<head>/i, `<head>${IMPORT_MAP}`));
    } else {
      createReadStream(file).pipe(response);
    }
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Test server on http://127.0.0.1:${port}`);
});
