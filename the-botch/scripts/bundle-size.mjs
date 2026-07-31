#!/usr/bin/env node
// .next/static 配下の JS/CSS を集計してカテゴリ別サイズを JSON で出力する。
// build-manifest.json を参照して framework / routes / manifest を分類する
// （Turbopack はファイル名が全てハッシュなので拡張子だけでは分けられないため）。
// bundle-size-diff.mjs が差分レポートの入力として使う。
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const NEXT_DIR = process.env.NEXT_DIR || ".next";
const STATIC_DIR = join(NEXT_DIR, "static");
const BUILD_MANIFEST = join(NEXT_DIR, "build-manifest.json");

if (!existsSync(STATIC_DIR)) {
  console.error(`bundle-size: ${STATIC_DIR} が見つからない。先に next build を実行すること`);
  process.exit(1);
}

const manifest = existsSync(BUILD_MANIFEST)
  ? JSON.parse(readFileSync(BUILD_MANIFEST, "utf8"))
  : {};

const frameworkSet = new Set([
  ...(manifest.rootMainFiles ?? []),
  ...(manifest.polyfillFiles ?? []),
]);
const manifestSet = new Set(manifest.lowPriorityFiles ?? []);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function classify(path) {
  const relToNext = relative(NEXT_DIR, path).replace(/\\/g, "/");
  const relToStatic = relative(STATIC_DIR, path).replace(/\\/g, "/");
  if (frameworkSet.has(relToNext)) return "framework";
  if (manifestSet.has(relToNext)) return "manifest";
  if (relToStatic.startsWith("css/") || relToStatic.endsWith(".css")) return "css";
  if (relToStatic.startsWith("media/")) return "media";
  return "routes";
}

const files = walk(STATIC_DIR).filter((f) => /\.(js|css)$/.test(f));
const byCategory = {};
let total = 0;

for (const file of files) {
  const size = statSync(file).size;
  byCategory[classify(file)] = (byCategory[classify(file)] ?? 0) + size;
  total += size;
}

process.stdout.write(
  JSON.stringify({ total, byCategory, fileCount: files.length }, null, 2) + "\n",
);
