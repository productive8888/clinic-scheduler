import { redirect } from "next/navigation";
import { getCurrentActor, isManagerRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getCurrentActor();

  if (!actor) {
    redirect("/sign-in");
  }

  if (!isManagerRole(actor.role)) {
    redirect("/employee");
  }

  return children;
}
