import { ScheduleBoard } from "@/components/schedule/schedule-board";
import { SetupRequired } from "@/components/layout/setup-required";
import { getSchedulePageData } from "@/lib/db/schedule";
import { todayIsoDate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const params = await searchParams;
  const date =
    typeof params.date === "string" && params.date ? params.date : todayIsoDate();
  let data: Awaited<ReturnType<typeof getSchedulePageData>>;

  try {
    data = await getSchedulePageData(date);
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before using the schedule board"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  return (
    <ScheduleBoard
      date={date}
      scheduleDay={data.scheduleDay}
      employees={data.employees}
      taskTypes={data.taskTypes}
    />
  );
}
