import {
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("..", import.meta.url));

const sourceDirectory = path.join(
  rootDirectory,
  "node_modules",
  "@phosphor-icons",
  "web",
  "src",
  "regular",
);

const packageDirectory = path.join(
  rootDirectory,
  "node_modules",
  "@phosphor-icons",
  "web",
);

const destinationDirectory = path.join(
  rootDirectory,
  "styles",
  "vendor",
  "phosphor",
);

await rm(destinationDirectory, {
  recursive: true,
  force: true,
});

await mkdir(destinationDirectory, {
  recursive: true,
});

const sourceCss = await readFile(
  path.join(sourceDirectory, "style.css"),
  "utf8",
);

// The official CSS references several font formats.
// The targeted browsers all support WOFF2.
const localCss = sourceCss.replace(
  /src:\s*[^;]+;/,
  'src: url("./Phosphor.woff2") format("woff2");',
);

if (localCss === sourceCss) {
  throw new Error(
    "La déclaration @font-face de Phosphor n'a pas été trouvée.",
  );
}

await Promise.all([
  writeFile(
    path.join(destinationDirectory, "style.css"),
    localCss,
    "utf8",
  ),

  copyFile(
    path.join(sourceDirectory, "Phosphor.woff2"),
    path.join(destinationDirectory, "Phosphor.woff2"),
  ),

  copyFile(
    path.join(packageDirectory, "LICENSE"),
    path.join(destinationDirectory, "LICENSE"),
  ),
]);

console.log("Phosphor regular copié dans styles/vendor/phosphor.");
