import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 디렉터리의 무관한 lockfile을 무시하고, OG 폰트(src/assets) 트레이싱 기준을 고정한다.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
