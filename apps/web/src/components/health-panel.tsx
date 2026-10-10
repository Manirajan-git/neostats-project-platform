export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  database: {
    status: "up" | "down";
    latencyMs?: number;
    error?: string;
  };
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

function StatusDot({ up }: { up: boolean }) {
  return (
    <span
      className={`inline-flex h-2.5 w-2.5 rounded-full ${
        up ? "bg-emerald-500" : "bg-rose-500"
      }`}
      aria-hidden
    />
  );
}

function StatusCard({
  title,
  subtitle,
  up,
  detail,
}: {
  title: string;
  subtitle: string;
  up: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </p>
        <div className="flex items-center gap-2">
          <StatusDot up={up} />
          <span
            className={`text-xs font-semibold ${
              up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {up ? "UP" : "DOWN"}
          </span>
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      <p className="mt-3 font-mono text-xs text-zinc-600 dark:text-zinc-300">
        {detail}
      </p>
    </div>
  );
}

export default async function HealthPanel() {
  const health = await getHealth();
  const apiUp = health !== null;
  const dbUp = apiUp && health.database.status === "up";

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatusCard
        title="Frontend"
        subtitle="Next.js App Router · TypeScript · Tailwind"
        up
        detail="rendered on this request"
      />
      <StatusCard
        title="API"
        subtitle="Express + TypeScript"
        up={apiUp}
        detail={
          apiUp
            ? `GET /api/health · uptime ${health.uptimeSeconds}s`
            : `${API_URL}/api/health unreachable`
        }
      />
      <StatusCard
        title="Database"
        subtitle="PostgreSQL · Prisma"
        up={dbUp}
        detail={
          dbUp
            ? `Neostats reachable · ${health.database.latencyMs}ms`
            : apiUp
              ? (health.database.error ?? "query failed")
              : "unknown — API unreachable"
        }
      />
    </div>
  );
}
