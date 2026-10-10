import type { SystemRole } from "@prisma/client";

/** Safe user representation - never contains passwordHash. */
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
