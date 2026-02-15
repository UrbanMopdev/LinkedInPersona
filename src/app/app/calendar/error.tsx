"use client";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-destructive mb-2">
        Calendar failed to load
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {error.message || "Unknown error"}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground mb-4">
          Digest: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
