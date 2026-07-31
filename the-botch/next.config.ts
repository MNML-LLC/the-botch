import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const isDev = process.env.NODE_ENV === "development";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// 段階的導入: Report-Only で違反がないことを確認済みのため Enforce に切り替え
// (Issue #77)。問題が発生した場合は true に戻すと Report-Only に復帰できる
const CSP_REPORT_ONLY = false;

// Next.js は本番でもハイドレーション用のインラインスクリプトを注入するため
// script-src に 'unsafe-inline' が必要（nonce 化する場合は middleware 導入が必要）。
// 開発時のみ React Fast Refresh のため 'unsafe-eval' を許可する。
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    scrollRestoration: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: CSP_REPORT_ONLY
              ? "Content-Security-Policy-Report-Only"
              : "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
