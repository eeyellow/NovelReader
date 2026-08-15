/**
 * Detect a user-friendly device name for sync tracking (e.g., "iPhone", "iPad", "MacBook", "Windows PC")
 */
export function getDeviceName(): string {
  if (typeof window === "undefined") return "Server";

  // Check if user set a custom device name
  const storedName = localStorage.getItem("novel_reader_device_name");
  if (storedName) return storedName;

  const ua = navigator.userAgent;
  let device = "瀏覽器裝置";

  if (/iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    device = "iPad";
  } else if (/iPhone/i.test(ua)) {
    device = "iPhone";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    device = "MacBook / Mac";
  } else if (/Windows NT/i.test(ua)) {
    device = "Windows PC";
  } else if (/Android/i.test(ua)) {
    device = "Android 手機";
  } else if (/Linux/i.test(ua)) {
    device = "Linux 電腦";
  }

  return device;
}

export function setCustomDeviceName(name: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("novel_reader_device_name", name.trim());
  }
}
