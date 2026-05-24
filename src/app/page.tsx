import { redirect } from "next/navigation";
import { getCurrentActor, isManagerRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const actor = await getCurrentActor();

  if (!actor) {
    redirect("/login");
  }

  redirect(isManagerRole(actor.role) ? "/schedule" : "/employee");
}
