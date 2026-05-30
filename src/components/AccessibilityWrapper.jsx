import { useEffect, useState } from "react";

export default function AccessibilityWrapper({ children }) {
  const [skipLinkVisible, setSkipLinkVisible] = useState(false);

  useEffect(() => {
    const handleTabPress = (e) => {
      if (e.key === "Tab") {
        setSkipLinkVisible(true);
      }
    };

    const handleClick = () => {
      setSkipLinkVisible(false);
    };

    document.addEventListener("keydown", handleTabPress);
    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("keydown", handleTabPress);
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <>
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className={`fixed top-4 left-4 z-[100] bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold shadow-lg transition-all duration-200 ${
          skipLinkVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
        style={{ outline: "2px solid white", outlineOffset: "2px" }}
      >
        Skip to main content
      </a>

      {/* Main content wrapper with proper ARIA */}
      <main id="main-content" role="main" tabIndex="-1">
        {children}
      </main>

      {/* Live region for announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        id="aria-live-region"
      />
    </>
  );
}