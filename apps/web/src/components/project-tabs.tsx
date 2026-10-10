"use client";

import Link from "next/link";
import { Activity, FolderKanban, ListChecks, Users } from "lucide-react";

export type ProjectTab = "overview" | "tasks" | "team" | "activity";

const TABS: { key: ProjectTab; label: string; icon: typeof FolderKanban }[] = [
  { key: "overview", label: "Overview", icon: FolderKanban },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "team", label: "Team", icon: Users },
  { key: "activity", label: "Activity", icon: Activity },
];

export function ProjectTabs({ projectId, active }: { projectId: string; active: ProjectTab }) {
  const base = `/projects/${projectId}`;
  const hrefs: Record<ProjectTab, string> = {
    overview: base,
    tasks: `${base}/tasks`,
    team: `${base}/team`,
    activity: `${base}/activity`,
  };

  return (
    <nav
      aria-label="Project sections"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={hrefs[key]}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-brand text-ink"
                : "border-transparent text-ink-faint hover:border-line-strong hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
