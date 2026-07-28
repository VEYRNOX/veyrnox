// @ts-nocheck
// React hook mirroring navigator.onLine, updated by the browser's `online`/
// `offline` events. Treat the value as a HINT — the platform reports `true`
// whenever any network interface is up, so a device on WiFi with no route to
// the internet still reads as online. We use it to reduce error-toast noise
// during obvious offline drops, not as a gate on any operation.
import { useEffect, useState } from "react";

function readInitial() {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return true;
  }
  return navigator.onLine;
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(readInitial);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

export default useOnlineStatus;
