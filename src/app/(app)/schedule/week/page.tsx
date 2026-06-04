import { redirect } from "next/navigation";
import { SetupRequired } from "@/components/layout/setup-required";
import { ScheduleWeekBoard } from "@/components/schedule/schedule-week-board";
import { getCurrentActor, isManagerRole } from "@/lib/auth";
import { getScheduleWeekData } from "@/lib/db/schedule-workflows";
import { todayIsoDate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function ScheduleWeekPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const date = typeof params.date === "string" ? params.date : todayIsoDate();
  const actor = await getCurrentActor();

  if (!actor) {
    redirect("/login");
  }

  if (!isManagerRole(actor.role)) {
    redirect("/employee");
  }

  let data: Awaited<ReturnType<typeof getScheduleWeekData>>;

  try {
    data = await getScheduleWeekData(date);
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before using the week schedule"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  return (
    <ScheduleWeekBoard
      data={data}
      resultSummary={{
        generated: stringParam(params.generated),
        shifts: stringParam(params.shifts),
        clinicSlots: stringParam(params.clinicSlots),
        backgroundSlots: stringParam(params.backgroundSlots),
        filled: stringParam(params.filled),
        shortages: stringParam(params.shortages),
        publishedSkipped: stringParam(params.publishedSkipped),
        published: stringParam(params.published),
        publishSkipped: stringParam(params.publishSkipped),
      }}
    />
  );
}

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}
