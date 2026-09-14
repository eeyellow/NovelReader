/**
 * @file version.ts
 * @description 應用程式版本與建置環境常數
 */

export const APP_VERSION = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || "dev";
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "";
