import { redirect } from "next/navigation";
import { SetupRequired } from "@/components/layout/setup-required";
import { ScheduleCalendar } from "@/components/schedule/schedule-calendar";
import { getCurrentActor, isManagerRole } from "@/lib/auth";
import { getScheduleCalendarData } from "@/lib/db/schedule-workflows";
import { todayIsoDate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function ScheduleCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedDate =
    typeof params.date === "string" && params.date ? params.date : todayIsoDate();
  const date = /^\d{4}-\d{2}$/.test(requestedDate)
    ? `${requestedDate}-01`
    : requestedDate.slice(0, 10);
  const actor = await getCurrentActor();

  if (!actor) {
    redirect("/login");
  }

  if (!isManagerRole(actor.role)) {
    redirect("/employee");
  }

  let data: Awaited<ReturnType<typeof getScheduleCalendarData>>;

  try {
    data = await getScheduleCalendarData(date);
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before using schedule status"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  return <ScheduleCalendar data={data} />;
}
