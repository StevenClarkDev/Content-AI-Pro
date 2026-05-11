import type { CapacitorConfig } from "@capacitor/cli";

type ContentAIProCapacitorConfig = CapacitorConfig & {
  bundledWebRuntime?: boolean;
};

const config: ContentAIProCapacitorConfig = {
  appId: "com.contentaipro.app",
  appName: "Content AI Pro",
  webDir: "build",
  bundledWebRuntime: false,
};

export default config;
