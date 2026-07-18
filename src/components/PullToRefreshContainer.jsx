import { useState, useRef } from "react";

const THRESHOLD = 72;

/**
 * Wraps any scrollable content with native-style pull-to-refresh.
 * Usage: <PullToRefreshContainer onRefresh={refetchFn} className="h-full overflow-auto">
 *          {children}
 *        </PullToRefreshContainer>
 */
export default function PullToRefreshContainer({ onRefresh, children, className = "" }) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef(null);

  const handleTouchStart = (e) => {
    if ((containerRef.current?.scrollTop ?? 0) > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  };

  const handleTouchMove = (e) => {
    if (!pulling.current || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      // Only prevent default for genuine pull-down (not scroll-up into content).
      // Calling preventDefault on a non-passive listener blocks native scroll;
      // guard strictly so upward swipes to scroll content are never blocked.
      if ((containerRef.current?.scrollTop ?? 0) === 0) {
        e.preventDefault();
      }
      setPullY(Math.min(dy * 0.45, THRESHOLD + 24));
    } else {
      // User is scrolling up into content — cancel any pull state immediately.
      pulling.current = false;
      setPullY(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullY >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(48);
      try { await onRefresh?.(); } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  };

  const showIndicator = pullY > 8 || refreshing;
  const indicatorProgress = Math.min(pullY / THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Vault-motif pull indicator — a small circular safe dial. Ticks rotate
          in proportion to pull distance so the affordance feels physical:
          farther pull = more turn. When the release threshold is crossed the
          teal accent brightens and the shield fills in. On release + refresh
          the dial spins continuously (matches VaultIllustration language). */}
      {showIndicator && (
        <div
          className="absolute left-0 right-0 flex justify-center z-20 pointer-events-none"
          style={{ top: -40, transform: `translateY(${pullY}px)`, transition: refreshing ? undefined : "transform 0.1s ease" }}
        >
          <div className="h-10 w-10 rounded-full bg-card border border-border shadow-lg flex items-center justify-center relative overflow-hidden">
            {/* Ambient teal wash grows in with progress. */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-primary/15"
              style={{ opacity: indicatorProgress * 0.9 }}
            />
            <svg
              viewBox="0 0 40 40"
              className={refreshing ? "h-6 w-6 motion-safe:animate-spin" : "h-6 w-6"}
              style={refreshing ? { animationDuration: "1.4s" } : undefined}
              aria-hidden
            >
              {/* Outer ring. */}
              <circle cx="20" cy="20" r="15" fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
              {/* 12 tick marks that fade in with progress. */}
              {Array.from({ length: 12 }, (_, i) => {
                const angle = (i / 12) * 360;
                const t = Math.max(0, Math.min(1, indicatorProgress * 1.4 - i * 0.05));
                return (
                  <line
                    key={i}
                    x1="20" y1="6" x2="20" y2="9"
                    stroke="hsl(var(--primary))"
                    strokeOpacity={0.35 + t * 0.55}
                    strokeWidth={i % 3 === 0 ? 1.3 : 0.9}
                    transform={`rotate(${angle} 20 20)`}
                  />
                );
              })}
              {/* Central shield fills in as we cross threshold. */}
              <path
                d="M20 12 L26 15 L26 22 C26 26 23 28 20 29 C17 28 14 26 14 22 L14 15 Z"
                fill={indicatorProgress >= 1 ? "hsl(var(--primary))" : "none"}
                stroke="hsl(var(--primary))"
                strokeWidth="1.2"
                opacity={0.35 + indicatorProgress * 0.65}
              />
            </svg>
          </div>
        </div>
      )}

      {/* Content with push-down effect */}
      <div
        style={{
          transform: pullY > 0 ? `translateY(${pullY}px)` : undefined,
          transition: pulling.current ? undefined : "transform 0.3s ease",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}