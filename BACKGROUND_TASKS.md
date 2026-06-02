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
- whether rollover is allowed
- active status and notes

`BackgroundTaskInstance` supports future generated period obligations. The full
weekly/biweekly rollover optimizer is intentionally deferred until clinic policy
is finalized.
