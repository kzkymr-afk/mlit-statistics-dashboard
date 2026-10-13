import type { NextConfig } from "next";
import packageJson from "./package.json";

const pagesBasePath =
  process.env.GITHUB_PAGES === "true" ? "/mlit-statistics-dashboard" : "";

const buildChannel = process.env.ATLAS_BUILD_CHANNEL === "preview"
  ? "preview"
  : process.env.GITHUB_ACTIONS === "true" ? "published" : "local";
const buildId = buildChannel === "published"
  ? (process.env.GITHUB_SHA?.slice(0, 8) || "unknown")
  : (process.env.ATLAS_BUILD_CANDIDATE_ID?.trim().slice(0, 32) || "local");
const buildTimeUtc = new Date().toISOString();

const nextConfig: NextConfig = {
  env: {
    ATLAS_BUILD_CHANNEL: buildChannel,
    ATLAS_BUILD_ID: buildId,
    ATLAS_BUILD_VERSION: packageJson.version,
    ATLAS_BUILD_TIME_UTC: buildTimeUtc,
  },
  output: "export",
  trailingSlash: true,
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  images: { unoptimized: true },
};

export default nextConfig;
