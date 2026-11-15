import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  outputFileTracingRoot: appRoot,
  turbopack: { root: appRoot },
  poweredByHeader: false,
  serverExternalPackages: ["firebase-admin", "exceljs", "yauzl", "quickjs-emscripten"],
  outputFileTracingIncludes: {
    "/api/ask_csv": [
      "./node_modules/quickjs-emscripten/**",
      "./node_modules/quickjs-emscripten-core/**",
      "./node_modules/@jitl/**"
    ]
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
      ]
    }];
  }
};

export default config;
