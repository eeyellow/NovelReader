/**
 * @file version.ts
 * @description 應用程式版本與建置環境常數
 */

import versionData from "./version.json";

export const APP_VERSION =
  process.env.NEXT_PUBLIC_GIT_COMMIT_SHA && process.env.NEXT_PUBLIC_GIT_COMMIT_SHA !== "dev"
    ? process.env.NEXT_PUBLIC_GIT_COMMIT_SHA
    : versionData.commit || "c92f069";

export const BUILD_TIME =
  process.env.NEXT_PUBLIC_BUILD_TIME ||
  versionData.buildTime ||
  "";
