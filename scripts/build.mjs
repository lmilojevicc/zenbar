import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const buildEntries = ["manifest.json", "src", "styles", "ui"];

await validateManifest();
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const entry of buildEntries) {
  await copyEntry(entry);
}

console.log(`Built Zenbar into ${path.relative(rootDir, distDir) || "dist"}`);

async function validateManifest() {
  const manifestPath = path.join(rootDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (!manifest.manifest_version || !manifest.background?.service_worker) {
    throw new Error("manifest.json is missing required MV3 fields");
  }
}

async function copyEntry(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const targetPath = path.join(distDir, relativePath);
  const sourceStats = await stat(sourcePath);

  if (sourceStats.isDirectory()) {
    await copyDirectory(sourcePath, targetPath);
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

async function copyDirectory(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}
