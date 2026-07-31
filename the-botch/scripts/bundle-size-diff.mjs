#!/usr/bin/env node
// bundle-size.mjs が出力した2つの JSON を比較して Markdown レポートを出力する。
// +BUNDLE_WARN_PCT% 以上の増加があれば ::warning:: を出す。
import { readFileSync } from "node:fs";

const [, , basePath, prPath] = process.argv;
if (!basePath || !prPath) {
  console.error("usage: bundle-size-diff.mjs <base.json> <pr.json>");
  process.exit(2);
}

const WARN_PCT = Number(process.env.BUNDLE_WARN_PCT ?? "20");
const NOISE_BYTES = Number(process.env.BUNDLE_NOISE_BYTES ?? "1024");

const base = JSON.parse(readFileSync(basePath, "utf8"));
const pr = JSON.parse(readFileSync(prPath, "utf8"));

function fmtBytes(n) {
  if (n === 0) return "0 B";
  const abs = Math.abs(n);
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(abs) / Math.log(1024)), units.length - 1);
  const v = abs / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function diffCell(b, p) {
  const d = p - b;
  const pct = b === 0 ? (p === 0 ? 0 : Infinity) : (d / b) * 100;
  const sign = d > 0 ? "+" : d < 0 ? "-" : "±";
  const pctStr = Number.isFinite(pct)
    ? `${d >= 0 ? "+" : ""}${pct.toFixed(2)}%`
    : "new";
  return { d, pct, display: `${sign}${fmtBytes(Math.abs(d))} (${pctStr})` };
}

const categories = new Set([
  ...Object.keys(base.byCategory ?? {}),
  ...Object.keys(pr.byCategory ?? {}),
]);

const rows = [];
let hasWarning = false;
for (const cat of [...categories].sort()) {
  const b = base.byCategory?.[cat] ?? 0;
  const p = pr.byCategory?.[cat] ?? 0;
  const d = diffCell(b, p);
  const warn = d.d > NOISE_BYTES && Number.isFinite(d.pct) && d.pct >= WARN_PCT;
  if (warn) hasWarning = true;
  rows.push({ cat, b, p, d, warn });
}

const totalDiff = diffCell(base.total, pr.total);
const totalWarn =
  totalDiff.d > NOISE_BYTES &&
  Number.isFinite(totalDiff.pct) &&
  totalDiff.pct >= WARN_PCT;
if (totalWarn) hasWarning = true;

let md = "### Bundle Size Report\n\n";
if (hasWarning) {
  md += `> :warning: **警告**: バンドルサイズが +${WARN_PCT}% 以上増加しました。\n\n`;
}
md += "| カテゴリ | Base (main) | PR | 差分 |\n";
md += "|---|---:|---:|---:|\n";
md += `| **合計** | ${fmtBytes(base.total)} | ${fmtBytes(pr.total)} | ${totalDiff.display}${totalWarn ? " :warning:" : ""} |\n`;
for (const r of rows) {
  md += `| ${r.cat} | ${fmtBytes(r.b)} | ${fmtBytes(r.p)} | ${r.d.display}${r.warn ? " :warning:" : ""} |\n`;
}
md += `\n- 判定閾値: **+${WARN_PCT}%** で警告\n`;
md += `- 計測対象: \`.next/static/**/*.{js,css}\`\n`;
md += `- ローカル解析: \`npm run analyze\` (HTML レポートを生成)\n`;

process.stdout.write(md);

if (hasWarning) {
  console.error(`::warning::Bundle size increased by more than ${WARN_PCT}%`);
}
