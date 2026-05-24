import type { EmployeeRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id?: string;
      employeeId?: string;
      role?: EmployeeRole;
    };
  }
}
