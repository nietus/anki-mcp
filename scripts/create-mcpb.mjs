#!/usr/bin/env node
import { promises as fsp, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const stagingDir = path.join(rootDir, "dist", "mcpb");
const serverDir = path.join(stagingDir, "server");
const outputFile = path.join(rootDir, "dist", "anki-mcp.mcpb");

const manifestPath = path.join(rootDir, "manifest.json");
const buildDir = path.join(rootDir, "build");
const nodeModulesDir = path.join(rootDir, "node_modules");
const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");

async function ensureExists(target, hint) {
  try {
    await fsp.access(target);
  } catch (error) {
    throw new Error(
      `Missing ${hint} at ${target}. Run \"npm install\" and \"npm run build\" before bundling.`
    );
  }
}

async function copyIfExists(source, destination) {
  if (existsSync(source)) {
    await fsp.copyFile(source, destination);
  }
}

async function runPack(directory, output) {
  await fsp.mkdir(path.dirname(output), { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["@anthropic-ai/mcpb", "pack", directory, output],
      {
        cwd: rootDir,
        stdio: "inherit",
      }
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mcpb pack exited with code ${code}`));
      }
    });
  });
}

async function main() {
  await ensureExists(manifestPath, "manifest.json");
  await ensureExists(buildDir, "build output");
  await ensureExists(nodeModulesDir, "node_modules directory");

  await fsp.rm(stagingDir, { recursive: true, force: true });
  await fsp.mkdir(serverDir, { recursive: true });

  await fsp.copyFile(manifestPath, path.join(stagingDir, "manifest.json"));
  await fsp.cp(buildDir, serverDir, { recursive: true });

  await copyIfExists(packageJsonPath, path.join(stagingDir, "package.json"));
  await copyIfExists(
    packageLockPath,
    path.join(stagingDir, "package-lock.json")
  );
  await fsp.cp(nodeModulesDir, path.join(stagingDir, "node_modules"), {
    recursive: true,
  });

  await runPack(stagingDir, outputFile);

  await fsp.rm(stagingDir, { recursive: true, force: true });

  console.log(`\nMCP bundle created at ${outputFile}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
