import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
};

export default process.env.NODE_ENV === "production" ? withSerwist(nextConfig) : nextConfig;
