export default function HealthPanelSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-3 h-3 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-4 h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}
