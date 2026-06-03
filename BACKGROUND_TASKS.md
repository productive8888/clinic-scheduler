# Background Tasks

Background tasks are non-clinic work obligations. They are lower priority than
required clinic coverage, but the final priority order and protected-vs-pullable
policy are not finalized yet.

The current foundation stores:

- category
- task name and description
- estimated hours per period
- period type: weekly, biweekly, monthly, or custom
- priority
- mentor
- primary owner
- eligible employees
- required skills
- whether the task can be pulled for clinic coverage
- whether the task is protected from clinic pull
- whether rollover is allowed
- active status and notes

Easton's default pull-priority configuration is stored separately as
`BackgroundPullRule` rows. These rows rank employees for pullable background
work and can enforce max-pull caps per scheduling period. If a background task is
not pullable, or is marked protected, the pull-priority helper excludes it.

`BackgroundTaskInstance` supports future generated period obligations. The full
weekly/biweekly rollover optimizer is intentionally deferred until clinic policy
is finalized.
