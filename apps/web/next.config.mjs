/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are consumed as TypeScript source, so Next transpiles them.
  transpilePackages: [
    "@trip/shared",
    "@trip/orchestrator",
    "@trip/agents",
    "@trip/services",
    "@trip/tools",
  ],
};

export default nextConfig;
