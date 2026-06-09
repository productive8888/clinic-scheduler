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
        processed: stringParam(params.processed),
        daysCreated: stringParam(params.daysCreated),
        daysRegenerated: stringParam(params.daysRegenerated),
        blocks: stringParam(params.blocks),
        amBlocks: stringParam(params.amBlocks),
        pmBlocks: stringParam(params.pmBlocks),
        saturdayBlocks: stringParam(params.saturdayBlocks),
        amEarlyBlocks: stringParam(params.amEarlyBlocks),
        amRegularBlocks: stringParam(params.amRegularBlocks),
        pmRegularBlocks: stringParam(params.pmRegularBlocks),
        mondayLongPmBlocks: stringParam(params.mondayLongPmBlocks),
        saturdayEndoscopyBlocks: stringParam(params.saturdayEndoscopyBlocks),
        saturdayRegularBlocks: stringParam(params.saturdayRegularBlocks),
        slotsCreated: stringParam(params.slotsCreated),
        clinicSlots: stringParam(params.clinicSlots),
        backgroundSlots: stringParam(params.backgroundSlots),
        workPatternSlots: stringParam(params.workPatternSlots),
        workPatternAssignments: stringParam(params.workPatternAssignments),
        workPatternSwaps: stringParam(params.workPatternSwaps),
        workPatternUnresolved: stringParam(params.workPatternUnresolved),
        workPatternEmployees: stringParam(params.workPatternEmployees),
        workPatternRequiredExtraDays: stringParam(
          params.workPatternRequiredExtraDays,
        ),
        workPatternSatisfiedExtraDays: stringParam(
          params.workPatternSatisfiedExtraDays,
        ),
        missingExtraHourEmployees: stringParam(params.missingExtraHourEmployees),
        topOffSlots: stringParam(params.topOffSlots),
        topOffAssignments: stringParam(params.topOffAssignments),
        topOffIncomplete: stringParam(params.topOffIncomplete),
        filled: stringParam(params.filled),
        requiredUnfilled: stringParam(params.requiredUnfilled),
        shortages: stringParam(params.shortages),
        conflicts: stringParam(params.conflicts),
        underTarget: stringParam(params.underTarget),
        overTarget: stringParam(params.overTarget),
        hardRequirements: stringParam(params.hardRequirements),
        bgMinimum: stringParam(params.bgMinimum),
        workPatterns: stringParam(params.workPatterns),
        review: stringParam(params.review),
        publishedSkipped: stringParam(params.publishedSkipped),
        published: stringParam(params.published),
        publishBlocked: stringParam(params.publishBlocked),
        unpublished: stringParam(params.unpublished),
        unpublishSkipped: stringParam(params.unpublishSkipped),
        cleared: stringParam(params.cleared),
        clearSkipped: stringParam(params.clearSkipped),
        clearSlots: stringParam(params.clearSlots),
        clearAssignments: stringParam(params.clearAssignments),
      }}
    />
  );
}

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}
