import { build } from "esbuild";
import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const staticEntries = ["icons", "manifest.json", "styles", "ui"] as const;
const bundleEntries = [
  "src/background/service-worker.ts",
  "src/content/bootstrap.ts",
  "src/ui/options.ts",
  "src/ui/overlay-entry.ts",
  "src/ui/window.ts"
] as const;

await validateManifest();
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const entry of staticEntries) {
  await copyEntry(entry);
}

await build({
  entryPoints: bundleEntries.map((entry) => path.join(rootDir, entry)),
  outdir: distDir,
  outbase: rootDir,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome114"],
  treeShaking: true,
  legalComments: "none",
  logLevel: "silent"
});

console.log(`Built Zenbar into ${path.relative(rootDir, distDir) || "dist"}`);

async function validateManifest(): Promise<void> {
  const manifestPath = path.join(rootDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    manifest_version?: number;
    background?: { service_worker?: string };
  };

  if (!manifest.manifest_version || !manifest.background?.service_worker) {
    throw new Error("manifest.json is missing required MV3 fields");
  }
}

async function copyEntry(relativePath: string): Promise<void> {
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

async function copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
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
