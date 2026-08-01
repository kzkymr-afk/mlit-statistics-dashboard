import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const buildDirectory = resolve(root, "dist");
const omittedDirectories = ["system", "data"].map((name) => ({
  source: resolve(root, `public/${name}`),
  hidden: resolve(root, `work/sites-build-public-${name}`),
}));

for (const directory of omittedDirectories) {
  if (existsSync(directory.hidden)) {
    throw new Error(
      `前回のSitesビルド退避フォルダが残っています: ${directory.hidden}`,
    );
  }
}

const movedDirectories = [];
try {
  if (existsSync(buildDirectory)) {
    rmSync(buildDirectory, { recursive: true });
  }
  for (const directory of omittedDirectories) {
    if (!existsSync(directory.source)) continue;
    mkdirSync(dirname(directory.hidden), { recursive: true });
    renameSync(directory.source, directory.hidden);
    movedDirectories.push(directory);
  }
  const executable = resolve(
    root,
    "node_modules/.bin",
    process.platform === "win32" ? "vinext.cmd" : "vinext",
  );
  const build = spawnSync(executable, ["build"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (build.error) throw build.error;
  if (build.status !== 0) {
    throw new Error(`Sitesビルドが終了コード${build.status}で失敗しました。`);
  }
} finally {
  for (const directory of movedDirectories.reverse()) {
    if (existsSync(directory.hidden)) {
      renameSync(directory.hidden, directory.source);
    }
  }
}
