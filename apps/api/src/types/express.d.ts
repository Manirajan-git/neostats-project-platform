import type { SafeUser } from "./dto";

declare global {
  namespace Express {
    interface Request {
      /** Populated by the authenticate middleware; never set on public routes. */
      user?: SafeUser;
    }
  }
}

export {};
