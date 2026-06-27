import { useState, useRef } from "react";
import { RefreshCw } from "lucide-react";

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
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="absolute left-0 right-0 flex justify-center z-20 pointer-events-none"
          style={{ top: -40, transform: `translateY(${pullY}px)`, transition: refreshing ? undefined : "transform 0.1s ease" }}
        >
          <div className={`h-9 w-9 rounded-full bg-card border border-border shadow-md flex items-center justify-center ${refreshing ? "animate-spin" : ""}`}>
            <RefreshCw
              className="h-4 w-4 text-primary"
              style={{ opacity: indicatorProgress, transform: `rotate(${indicatorProgress * 180}deg)` }}
            />
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