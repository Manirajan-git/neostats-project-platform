import { PrismaClient, type ProjectRole, type TaskPriority, type TaskStatus } from "@prisma/client";
import { runSeed } from "./seed";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const DEMO_PREFIX = "Demo:";

interface DemoMember {
  emailEnv: string;
  defaultEmail: string;
  role: ProjectRole;
}

interface DemoTask {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: "member" | "manager" | "viewer";
  /** Days from today; negative = overdue, null = no due date. */
  dueInDays: number | null;
}

interface DemoProject {
  name: string;
  description: string;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
  manager: "admin" | "manager";
  members: DemoMember[];
  tasks: DemoTask[];
}

const PROJECTS: DemoProject[] = [
  {
    name: `${DEMO_PREFIX} Website Redesign`,
    description:
      "(Demo data) Marketing site refresh: new landing pages, design system rollout and performance work.",
    status: "ACTIVE",
    manager: "manager",
    members: [
      { emailEnv: "SEED_MANAGER_EMAIL", defaultEmail: "manager@neostats.dev", role: "MANAGER" },
      { emailEnv: "SEED_MEMBER_EMAIL", defaultEmail: "member@neostats.dev", role: "MEMBER" },
      { emailEnv: "SEED_VIEWER_EMAIL", defaultEmail: "viewer@neostats.dev", role: "VIEWER" },
    ],
    tasks: [
      {
        title: "Audit current site structure",
        description: "Inventory pages, redirects and analytics gaps before the redesign.",
        status: "DONE",
        priority: "MEDIUM",
        assignee: "member",
        dueInDays: -6,
      },
      {
        title: "Approve new design system tokens",
        description: "Colour, type and spacing tokens from the brand refresh.",
        status: "DONE",
        priority: "HIGH",
        assignee: "manager",
        dueInDays: -2,
      },
      {
        title: "Build landing page templates",
        description: "Hero, feature grid and pricing sections as reusable blocks.",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assignee: "member",
        dueInDays: 2,
      },
      {
        title: "Migrate blog content",
        description: "Move 40+ posts with redirects in place.",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        assignee: "member",
        dueInDays: 5,
      },
      {
        title: "Fix checkout scroll bug on Safari",
        description: "Reproduced on 17.x — breaks the sticky CTA.",
        status: "BLOCKED",
        priority: "URGENT",
        assignee: "member",
        dueInDays: -1,
      },
      {
        title: "Set up performance budget",
        status: "TODO",
        priority: "MEDIUM",
        assignee: "manager",
        dueInDays: 9,
      },
      {
        title: "Accessibility review (WCAG 2.2 AA)",
        description: "Keyboard paths, focus states and contrast checks.",
        status: "TODO",
        priority: "HIGH",
        dueInDays: 12,
      },
      {
        title: "Write launch announcement",
        status: "TODO",
        priority: "LOW",
        assignee: "viewer",
        dueInDays: null,
      },
    ],
  },
  {
    name: `${DEMO_PREFIX} Data Platform Migration`,
    description:
      "(Demo data) Move batch pipelines to the new warehouse with zero-downtime cutover.",
    status: "ACTIVE",
    manager: "admin",
    members: [
      { emailEnv: "SEED_MEMBER_EMAIL", defaultEmail: "member@neostats.dev", role: "MEMBER" },
      { emailEnv: "SEED_MANAGER_EMAIL", defaultEmail: "manager@neostats.dev", role: "MANAGER" },
    ],
    tasks: [
      {
        title: "Map legacy tables to the new schema",
        status: "DONE",
        priority: "HIGH",
        assignee: "member",
        dueInDays: -4,
      },
      {
        title: "Dual-write validation script",
        description: "Row counts and checksums for 7 days of traffic.",
        status: "IN_PROGRESS",
        priority: "URGENT",
        assignee: "member",
        dueInDays: 1,
      },
      {
        title: "Cutover runbook",
        description: "Step-by-step rollback plan for the migration window.",
        status: "TODO",
        priority: "HIGH",
        assignee: "manager",
        dueInDays: 7,
      },
      {
        title: "Decommission old ETL jobs",
        status: "TODO",
        priority: "LOW",
        dueInDays: 21,
      },
    ],
  },
  {
    name: `${DEMO_PREFIX} Mobile App Launch`,
    description: "(Demo data) Paused while the API rate-limit work lands.",
    status: "ON_HOLD",
    manager: "manager",
    members: [{ emailEnv: "SEED_MEMBER_EMAIL", defaultEmail: "member@neostats.dev", role: "MEMBER" }],
    tasks: [
      {
        title: "Push notification service setup",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        assignee: "member",
        dueInDays: 4,
      },
      {
        title: "App store screenshots",
        status: "TODO",
        priority: "LOW",
        assignee: "member",
        dueInDays: null,
      },
    ],
  },
  {
    name: `${DEMO_PREFIX} Q3 Reporting Cleanup`,
    description: "(Demo data) Closed out — dashboards and exports are live.",
    status: "COMPLETED",
    manager: "admin",
    members: [{ emailEnv: "SEED_VIEWER_EMAIL", defaultEmail: "viewer@neostats.dev", role: "VIEWER" }],
    tasks: [
      {
        title: "Rebuild executive dashboard",
        status: "DONE",
        priority: "HIGH",
        assignee: "viewer",
        dueInDays: -10,
      },
      {
        title: "Automate export emails",
        status: "DONE",
        priority: "MEDIUM",
        assignee: "viewer",
        dueInDays: -8,
      },
    ],
  },
];

export interface DemoSeedResult {
  projectsCreated: number;
  projectsSkipped: number;
  tasksCreated: number;
  notes: string[];
}

/**
 * Idempotent, clearly-labelled demo content (names start with "Demo:").
 * Never touches real records: each project is skipped if it already exists,
 * and users are only ever reused, never modified.
 */
export async function runDemoSeed(): Promise<DemoSeedResult> {
  // Make sure the four development accounts exist first.
  await runSeed();

  const emails = new Set<string>();
  for (const project of PROJECTS) {
    emails.add(project.manager === "admin" ? "SEED_ADMIN_EMAIL" : "SEED_MANAGER_EMAIL");
    for (const member of project.members) emails.add(member.emailEnv);
  }

  const users = new Map<string, string>(); // email -> id
  for (const envName of emails) {
    const email = (process.env[envName] ?? defaultEmailFor(envName)).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) users.set(email, user.id);
  }

  const userId = (envName: string): string => {
    const email = (process.env[envName] ?? defaultEmailFor(envName)).trim().toLowerCase();
    const id = users.get(email);
    if (!id) throw new Error(`[seed-demo] development account missing: ${email}`);
    return id;
  };

  const result: DemoSeedResult = {
    projectsCreated: 0,
    projectsSkipped: 0,
    tasksCreated: 0,
    notes: [],
  };

  for (const plan of PROJECTS) {
    const existing = await prisma.project.findFirst({ where: { name: plan.name } });
    if (existing) {
      result.projectsSkipped += 1;
      continue;
    }

    const managerId =
      plan.manager === "admin"
        ? userId("SEED_ADMIN_EMAIL")
        : userId("SEED_MANAGER_EMAIL");

    const project = await prisma.project.create({
      data: {
        name: plan.name,
        description: plan.description,
        status: plan.status,
        managerId,
        members: {
          create: plan.members.map((member) => ({
            userId: userId(member.emailEnv),
            role: member.role,
          })),
        },
      },
    });
    result.projectsCreated += 1;

    const creatorId = managerId;
    for (const task of plan.tasks) {
      const assigneeEnv =
        task.assignee === "manager"
          ? "SEED_MANAGER_EMAIL"
          : task.assignee === "viewer"
            ? "SEED_VIEWER_EMAIL"
            : task.assignee === "member"
              ? "SEED_MEMBER_EMAIL"
              : null;

      const created = await prisma.task.create({
        data: {
          title: task.title,
          description: task.description ?? null,
          status: task.status,
          priority: task.priority,
          projectId: project.id,
          creatorId,
          assigneeId: assigneeEnv ? userId(assigneeEnv) : null,
          dueDate: task.dueInDays === null ? null : new Date(Date.now() + task.dueInDays * DAY),
        },
      });
      result.tasksCreated += 1;

      if (assigneeEnv && task.status !== "TODO") {
        await prisma.notification.create({
          data: {
            userId: userId(assigneeEnv),
            type: "TASK_ASSIGNED",
            message: `You were assigned "${created.title}" in ${project.name}`,
            entityType: "TASK",
            entityId: created.id,
            projectId: project.id,
            read: false,
          },
        });
      }
    }

    // Seed one comment thread so activity/comment UIs have content.
    const firstTask = await prisma.task.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
    });
    if (firstTask) {
      await prisma.comment.create({
        data: {
          taskId: firstTask.id,
          authorId: creatorId,
          content: "(Demo data) Picking this up this week — shout if you need it sooner.",
        },
      });
      await prisma.activityLog.create({
        data: {
          actorId: creatorId,
          projectId: project.id,
          action: "task.created",
          entityType: "TASK",
          entityId: firstTask.id,
          summary: `Demo seed created task "${firstTask.title}"`,
          metadata: { source: "seed-demo" },
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        actorId: creatorId,
        projectId: project.id,
        action: "project.created",
        entityType: "PROJECT",
        entityId: project.id,
        summary: `Demo seed created project "${project.name}"`,
        metadata: { source: "seed-demo" },
      },
    });
  }

  if (result.projectsCreated > 0) {
    result.notes.push(
      "Demo projects are prefixed 'Demo:' — delete them from the Projects screen at any time.",
    );
  }
  return result;
}

function defaultEmailFor(envName: string): string {
  const map: Record<string, string> = {
    SEED_ADMIN_EMAIL: "admin@neostats.dev",
    SEED_MANAGER_EMAIL: "manager@neostats.dev",
    SEED_MEMBER_EMAIL: "member@neostats.dev",
    SEED_VIEWER_EMAIL: "viewer@neostats.dev",
  };
  const email = map[envName];
  if (!email) throw new Error(`[seed-demo] unknown seed account: ${envName}`);
  return email;
}

if (typeof require !== "undefined" && require.main === module) {
  runDemoSeed()
    .then((result) => {
      console.log(
        `[seed-demo] projects created: ${result.projectsCreated}, skipped (already exist): ${result.projectsSkipped}, tasks created: ${result.tasksCreated}`,
      );
      for (const note of result.notes) console.log(`[seed-demo] ${note}`);
      console.log("[seed-demo] development-only data. Never run against production.");
    })
    .catch((error: unknown) => {
      console.error("[seed-demo] failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
