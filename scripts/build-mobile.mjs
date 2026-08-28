import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptsDirectory, "..");
const outputDirectory = path.resolve(rootDirectory, "mobile-dist");

if (!outputDirectory.startsWith(`${rootDirectory}${path.sep}`)) {
  throw new Error("移动端输出目录必须位于项目目录内。");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const sourceFiles = [
  "boot-guard.js",
  "lib.js",
  "mobile-runtime.js",
  "mobile.css",
  "mobile.js",
  "preview-runtime.js"
];

await Promise.all(
  sourceFiles.map((filename) => cp(
    path.join(rootDirectory, "src", filename),
    path.join(outputDirectory, filename)
  ))
);

const sourceHtml = await readFile(path.join(rootDirectory, "src", "mobile.html"), "utf8");
await writeFile(path.join(outputDirectory, "index.html"), sourceHtml, "utf8");

console.log(`Mobile web assets prepared in ${outputDirectory}`);
