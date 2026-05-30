import { Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary";

export default function SafeSuspense({ children, fallback }) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          fallback || (
            <div className="flex items-center justify-center p-8 min-h-[200px]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            </div>
          )
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}