import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

export default function nextConfig(phase) {
  return {
    reactStrictMode: true,
    distDir:
      phase === PHASE_DEVELOPMENT_SERVER
        ? ".next"
        : process.env.NEXT_DIST_DIR || ".next"
  };
}
