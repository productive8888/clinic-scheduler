import { redirect } from "next/navigation";
import { ManualEditWorkspace } from "@/components/schedule/manual-edit/manual-edit-workspace";
import { SetupRequired } from "@/components/layout/setup-required";
import { getCurrentActor, isManagerRole } from "@/lib/auth";
import { getManualEditWorkspaceData } from "@/lib/db/manual-edit";
import { todayIsoDate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function ManualEditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentActor();

  if (!actor) {
    redirect("/login");
  }

  if (!isManagerRole(actor.role)) {
    redirect("/employee");
  }

  const params = await searchParams;
  const date = typeof params.date === "string" ? params.date : todayIsoDate();
  let data: Awaited<ReturnType<typeof getManualEditWorkspaceData>>;

  try {
    data = await getManualEditWorkspaceData(date);
  } catch (error) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <SetupRequired
          title="Generate or prepare this week before manual editing"
          message="The manual workspace needs schedule days, shifts, and slots for the selected week."
          detail={error instanceof Error ? error.message : "Unknown database error"}
        />
      </div>
    );
  }

  return <ManualEditWorkspace data={data} />;
}
