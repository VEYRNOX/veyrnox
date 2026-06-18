export default function AccessibilityWrapper({ children }) {
  return (
    <>
      {/* Skip-to-content link: visually hidden until IT is focused (first Tab
          from the top of the page). The old version listened for any Tab keydown
          and showed a persistent blue banner that only a click dismissed — so
          tabbing inside a form (e.g. the backup form) left the banner stuck on
          screen. `sr-only focus:not-sr-only` shows it only while focused and
          hides it again as soon as focus moves on, with no global listeners. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold focus:shadow-lg"
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