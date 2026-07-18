import { Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary";
import Spinner from "./Spinner";

export default function SafeSuspense({ children, fallback }) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          fallback || (
            <div className="flex items-center justify-center p-8 min-h-[200px]">
              <div className="flex flex-col items-center gap-3">
                <Spinner size="lg" label="Loading..." />
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