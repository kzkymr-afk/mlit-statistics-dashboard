import type { NextConfig } from "next";

const pagesBasePath =
  process.env.GITHUB_PAGES === "true" ? "/mlit-statistics-dashboard" : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  images: { unoptimized: true },
};

export default nextConfig;
