import { useEffect, useState } from "react";

// Hook that returns `true` while the document is visible and `false` when the
// tab/app is backgrounded. Wire the return value into a framer-motion
// `animate={isVisible ? {...} : false}` prop so `repeat: Infinity` loops stop
// consuming GPU/CPU when hidden. On Capacitor this fires on
// `document.visibilitychange` the same as the browser.
export function useInfiniteAnimation() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onChange = () => {
      setIsVisible(document.visibilityState !== "hidden");
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return isVisible;
}
