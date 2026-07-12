/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const repositoryName = "AegisPact.AI";

const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Apply basePath and assetPrefix ONLY in production/GitHub actions builds.
  // This allows local dev (npm run dev) to run prefix-free on http://localhost:3000/
  basePath: isProd ? `/${repositoryName}` : "",
  assetPrefix: isProd ? `/${repositoryName}/` : "",
};

export default nextConfig;
