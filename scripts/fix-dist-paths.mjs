import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const indexPath = fileURLToPath(new URL("../dist/index.html", import.meta.url));
const html = await readFile(indexPath, "utf8");

await writeFile(
  indexPath,
  html.replaceAll('src="/assets/', 'src="./assets/').replaceAll('href="/assets/', 'href="./assets/'),
  "utf8"
);
