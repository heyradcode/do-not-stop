import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pnpm workspace: trace server bundles from the monorepo root (see node_modules/next at repo root)
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;
