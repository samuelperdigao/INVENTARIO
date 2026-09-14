import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});

const productionApi = "https://inventory-api-6o8h.onrender.com";
const backendProxyUrl = (process.env.BACKEND_PROXY_URL ?? (process.env.NODE_ENV === "production" ? productionApi : "http://localhost:8000")).replace(/\/$/, "");

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_ANALYSIS_API_BASE_URL: process.env.NEXT_PUBLIC_ANALYSIS_API_BASE_URL ?? (process.env.NODE_ENV === "production" ? "/backend-api" : "http://localhost:8000"),
    NEXT_PUBLIC_SYNC_API_BASE_URL: process.env.NEXT_PUBLIC_SYNC_API_BASE_URL ?? (process.env.NODE_ENV === "production" ? "/backend-api" : "http://localhost:8000"),
  },
  async rewrites() {
    return [
      {
        source: "/backend-api/:path*",
        destination: `${backendProxyUrl}/:path*`,
      },
    ];
  },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), web-share=(self)" },
    ];
    if (process.env.INVENTORY_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default process.env.NODE_ENV === "production" ? withSerwist(nextConfig) : nextConfig;
