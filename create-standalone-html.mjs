import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = join(projectRoot, "dist");
const indexHtmlPath = join(distRoot, "index.html");
const standalonePath = join(projectRoot, "Regulatory-Radar-Standalone.html");

let html = await readFile(indexHtmlPath, "utf8");

const scriptMatch = html.match(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/);
const styleMatch = html.match(/<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/);

if (!scriptMatch || !styleMatch) {
  throw new Error("Could not find built JS/CSS assets in dist/index.html");
}

const js = (await readFile(join(distRoot, "assets", scriptMatch[1]), "utf8"))
  .replaceAll("</script", "<\\/script")
  .replaceAll("<!--", "<\\!--");
const css = await readFile(join(distRoot, "assets", styleMatch[1]), "utf8");

html = html
  .replace(styleMatch[0], `<style>\n${css}\n</style>`)
  .replace(scriptMatch[0], `<script type="module">\n${js}\n</script>`);

const scriptClose = html.lastIndexOf("</script>");
if (scriptClose === -1) {
  throw new Error("Standalone HTML is missing the final script close tag");
}

html =
  html.slice(0, scriptClose).replaceAll("</script>", "<\\/script>") +
  html.slice(scriptClose);

await writeFile(standalonePath, html, "utf8");

console.log(`Created ${standalonePath}`);
