export const REQUIRED_CONFIGURABLE_SKILLS = [
  {
    code: "IT",
    name: "IT",
    description: "Required for IT support assignments.",
  },
  {
    code: "PRIOR_AUTHORIZATION",
    name: "PA / Prior Authorization",
    description:
      "Required for prior authorization work. This is distinct from the Physician Assistant / MD task type.",
  },
  {
    code: "RESEARCH",
    name: "Research",
    description: "Required for research work assignments.",
  },
] as const;

export const REQUIRED_TASK_SKILL_CODES = {
  IT: ["IT"],
  PRIOR_AUTHORIZATION: ["PRIOR_AUTHORIZATION"],
  RESEARCH: ["RESEARCH"],
} as const;
