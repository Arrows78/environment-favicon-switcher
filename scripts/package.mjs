import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_ENTRIES = [
  "_locales",
  "config",
  "icons",
  "src",
  "styles",
  "manifest.json",
  "options.html",
  "popup.html"
];
const FIXED_EPOCH = Number.parseInt(process.env.SOURCE_DATE_EPOCH || "1704067200", 10);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(epochSeconds) {
  const date = new Date(Math.max(315532800, epochSeconds) * 1000);
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  };
}

async function collect(entryPath) {
  const absolutePath = path.join(ROOT, entryPath);
  const directoryEntries = await readdir(absolutePath, { withFileTypes: true }).catch(() => null);
  if (!directoryEntries) return [entryPath];

  const files = [];
  for (const entry of directoryEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.posix.join(entryPath.split(path.sep).join("/"), entry.name);
    if (entry.isDirectory()) files.push(...await collect(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function createZip(entries, timestamp) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, "utf8");
    const compressedCandidate = deflateRawSync(entry.content, { level: 9 });
    const useCompression = compressedCandidate.length < entry.content.length;
    const payload = useCompression ? compressedCandidate : entry.content;
    const method = useCompression ? 8 : 0;
    const checksum = crc32(entry.content);
    const flags = 0x0800;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(timestamp.time, 10);
    localHeader.writeUInt16LE(timestamp.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, fileName, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x031e, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(timestamp.time, 12);
    centralHeader.writeUInt16LE(timestamp.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, fileName);

    offset += localHeader.length + fileName.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

const manifest = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8"));
const fileNames = (await Promise.all(RUNTIME_ENTRIES.map(collect))).flat().sort();
if (fileNames.length > 0xffff) throw new Error("The extension contains too many files for a standard ZIP archive.");

const entries = await Promise.all(fileNames.map(async (name) => ({
  name: name.split(path.sep).join("/"),
  content: await readFile(path.join(ROOT, name))
})));
const archive = createZip(entries, dosTimestamp(FIXED_EPOCH));
const outputDirectory = path.join(ROOT, "dist");
const outputFile = path.join(outputDirectory, `environment-favicon-switcher-v${manifest.version}.zip`);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, archive);

const digest = createHash("sha256").update(archive).digest("hex");
console.log(`Packaged ${entries.length} files in ${path.relative(ROOT, outputFile)} (${archive.length} bytes).`);
console.log(`SHA-256 ${digest}`);
