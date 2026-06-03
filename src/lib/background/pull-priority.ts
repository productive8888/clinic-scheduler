export type BackgroundPullRuleInput = {
  employeeId: string;
  priorityRank: number;
  maxPullsPerPeriod?: number | null;
  active?: boolean;
};

export type BackgroundPullAssignmentInput = {
  assignmentId: string;
  employeeId: string;
  taskTypeCode: string;
  canBePulledForClinic: boolean;
  protectedFromPull?: boolean;
};

export function selectBackgroundPullCandidates(input: {
  assignments: BackgroundPullAssignmentInput[];
  rules: BackgroundPullRuleInput[];
  pullCountsByEmployee?: Record<string, number>;
}) {
  const rulesByEmployee = new Map(
    input.rules
      .filter((rule) => rule.active !== false)
      .map((rule) => [rule.employeeId, rule]),
  );

  return input.assignments
    .map((assignment) => {
      const rule = rulesByEmployee.get(assignment.employeeId);

      if (!rule || !assignment.canBePulledForClinic || assignment.protectedFromPull) {
        return null;
      }

      const existingPullCount =
        input.pullCountsByEmployee?.[assignment.employeeId] ?? 0;

      if (
        rule.maxPullsPerPeriod !== null &&
        rule.maxPullsPerPeriod !== undefined &&
        existingPullCount >= rule.maxPullsPerPeriod
      ) {
        return null;
      }

      return {
        ...assignment,
        priorityRank: rule.priorityRank,
        maxPullsPerPeriod: rule.maxPullsPerPeriod ?? null,
        existingPullCount,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    )
    .sort(
      (left, right) =>
        left.priorityRank - right.priorityRank ||
        left.existingPullCount - right.existingPullCount ||
        left.employeeId.localeCompare(right.employeeId) ||
        left.assignmentId.localeCompare(right.assignmentId),
    );
}
