Clinic Scheduling + PTO Management Web Application
Version: V1.0 Web Application Architecture Spec
Last Updated: May 23, 2026
SYSTEM OBJECTIVE
Build a production-ready web application for clinic staff scheduling and PTO management.
This application replaces a legacy Google Sheets + Apps Script scheduling system and should instead function as a modern hosted web application with:
Automatic schedule generation
Employee logins
PTO/unavailability submission
Manager overrides
Coverage resolution
Database-backed schedule management
Audit/history tracking
Google Calendar export support
Google Sheets export support
The system is NOT responsible for patient scheduling. It is only responsible for operational staffing assignments.

CRITICAL ENGINEERING RULES
Use TypeScript everywhere
Use PostgreSQL
Use Prisma ORM
Use modular architecture
Never place scheduling logic directly inside React components
Separate:
UI layer
API layer
scheduling engine
database layer
Keep scheduling engine pure and testable
Use reusable utility functions
Avoid giant files
Prefer many small composable modules
Use strict typing
Avoid hardcoded employee-specific logic
Use configuration-driven scheduling rules
Build with future scalability in mind
Use Prisma migrations for all schema changes
The scheduling engine must be deterministic and reproducible
The same inputs should generate the same schedule unless manually overridden

REQUIRED TECH STACK
Frontend:
Next.js
React
TypeScript
TailwindCSS
Backend:
Next.js API routes or equivalent backend layer
TypeScript
Database:
PostgreSQL
Prisma ORM
Authentication:
Clerk or NextAuth
Role-based authentication
Hosting:
Vercel-compatible deployment
Infrastructure:
Git + GitHub version control
Modular folder structure
Environment variable support
Recommended Hosting Stack:
Vercel
Neon or Supabase PostgreSQL

DEVELOPMENT WORKFLOW REQUIREMENTS
Before implementing features:
Analyze architecture first
Explain implementation plan
Identify risks/conflicts
Propose database schema changes first
Then generate code
Do NOT immediately begin coding without planning.
All major features should be implemented incrementally in phases.

DEVELOPMENT PHASES
Phase 1
Project setup
Authentication
Prisma schema
Database models
Employee CRUD system
Phase 2
Daily schedule UI
Task column layout
Assignment views
Admin dashboard
Phase 3
Scheduling engine
Skill matching
Fairness balancing
Constraint resolution
Phase 4
PTO workflow
Auto-regeneration
Coverage engine
Overrides
Phase 5
Google Calendar export
Google Sheets export
Audit/history logs
Reporting

RECOMMENDED PROJECT STRUCTURE
/app
/(dashboard)
/(employee)
/(admin)
/components
/lib
/db
/scheduler
/auth
/calendar
/utils
/prisma
/tests
/types
The scheduling engine must remain isolated inside:
/lib/scheduler
Do NOT tightly couple scheduling logic to UI components.

USER ROLES
1. Employee Role
Employees should be able to:
Log in securely
View upcoming schedules
View assigned tasks
Submit PTO requests
Submit absence/unavailability requests
View PTO balances
Submit reassignment/change requests
View their own profile
View their skill profile
View availability settings
2. Admin / Manager Role
Managers should be able to:
View all schedules
Generate schedules automatically
Edit schedules manually
Override assignments
Approve/reject PTO
Force overrides
Manage employee profiles
Manage skills
Configure staffing rules
Configure scheduling rules
Export schedules
View audit/history logs
See shortages/conflicts visually

SCHEDULING MODEL
The schedule is organized by DAY.
Each day has:
Multiple shift blocks
Multiple task columns
Assigned staff members inside each task column
Managers should be able to navigate between dates.
The schedule UI should resemble a clean operational staffing board.
Task slots belong to dated shift blocks so the same role can exist in AM, PM,
Saturday, or endoscopy blocks without duplicating task types.
Schedule generation can also read editable weekly schedule patterns derived from
Easton's private spreadsheet so weekdays can remain consistent week to week when
hard constraints allow it.
Example layout:
Date: June 5, 2026
Task
Assigned Staff
New Allergy
Person A
Virtual Allergy
Person B
New GI
Person C
Virtual GI
Person D
Followup
Person E
Front Desk
Person F
Civil Surgeon
Person G
Allergy Shots
Person H
Procedures
Person I


INITIAL TASK TYPES
New Allergy
Virtual Allergy
New GI
Virtual GI
Followup
Front Desk
Civil Surgeon
Allergy Shots
Procedures

TASK RULES
Interchangeable task groups:
New Allergy and Virtual Allergy are interchangeable
New GI and Virtual GI are interchangeable
Skill-restricted tasks:
Civil Surgeon requires Civil Surgeon skill
Allergy Shots requires Allergy Shot skill
Procedures may require Procedure skill
General-access tasks:
Followup
Front Desk
The scheduling engine must automatically enforce skill compatibility.

EMPLOYEE PROFILE MODEL
Each employee profile should contain:
Full name
Login/authentication
Weekly availability
Preferred tasks
Skill checklist
PTO balance
Weekly assignment limits
Start date
End date (optional)
Active/inactive status
Historical assignment counts
Skill system:
Boolean yes/no skills
Configurable preferred tasks
Extensible for future certifications

AVAILABILITY MODEL
Employees have:
Fixed weekly availability
PTO/unavailability requests
The scheduling engine must:
Respect recurring availability
Respect PTO
Respect approved absences
Prevent double-booking

SCHEDULING ENGINE REQUIREMENTS
The scheduling engine should:
Automatically generate schedules
Fill required task slots
Respect availability
Respect PTO
Respect skill requirements
Respect staffing minimums
Prevent double-booking
Rebuild schedules dynamically
Support deterministic schedule generation
The engine should prioritize:
Filling required skilled roles
Maintaining minimum staffing
Fair workload balancing
Preferred task assignments
Reducing overuse of difficult tasks
The engine should support future expansion for:
AM/PM shifts
Multi-location scheduling
AI-assisted optimization
Advanced scheduling heuristics

FAIRNESS ENGINE
The system should track:
Total assignments
Assignment frequency by task type
Historical workload
Difficult/unpopular assignments
Recent assignment distribution
The scheduler should attempt to:
Balance workload evenly
Avoid repeatedly assigning the same undesirable tasks
Prefer underutilized employees when possible
Fairness logic should remain configurable and modular.
Fairness can include patient-facing shift balance, per-skill/role targets,
GI/Allergy/PCP exposure goals, Saturday/endoscopy counts, total scheduled hours,
and week-to-week pattern consistency. These are soft objectives only.

PTO SYSTEM
Employees should be able to:
Submit PTO requests
Submit absence requests
Submit schedule-change requests
Managers should be able to:
Approve
Reject
Override
Once PTO is approved:
The scheduling engine should automatically regenerate affected assignments
Replacement staff should be selected automatically

COVERAGE ENGINE
If a scheduled employee becomes unavailable:
Step 1:
Attempt direct replacement using compatible unassigned staff
Step 2:
Attempt intelligent reassignment/swaps
Step 3:
Alert manager if minimum staffing cannot be satisfied
The engine should:
Preserve skill requirements
Preserve fairness balancing
Avoid schedule corruption

DATABASE MODEL REQUIREMENTS
Design normalized relational database tables for:
Employees
Skills
EmployeeSkills
Availability
ScheduleDays
TaskTypes
TaskSlots
Assignments
PTORequests
SchedulingRules
AuditLogs
IMPORTANT:
The system MUST separate:
Task Type
Task Slot
Assignment
Example:
Task Type = Front Desk
Task Slot = Front Desk #1 on June 5
Assignment = Employee assigned to that slot
This separation is critical for maintainability.

UI REQUIREMENTS
The UI should be:
Clean
Minimal
Operationally efficient
Easy to scan quickly
Dashboard-oriented
Managers should be able to:
Drag/drop assignments
Override assignments
View shortages visually
View unfilled roles
View PTO conflicts
Navigate quickly between dates
Employees should have:
Simple schedule views
Simple PTO submission workflows
Mobile-friendly pages

EXPORTS
The system should support:
Google Calendar export
Google Sheets export
Printable schedule views
Calendar exports should reflect:
Daily assignments
PTO
Staffing shortages
Overrides

AUDIT + HISTORY REQUIREMENTS
Track:
Schedule changes
PTO approvals/rejections
Manual overrides
Assignment history
Schedule regenerations
User actions
Audit logs should include:
Timestamp
User
Action performed
Before/after values

TESTING REQUIREMENTS
Create:
Unit tests
Scheduling simulation tests
Constraint validation tests
The system must test:
No employee double-booking
Skill compatibility enforcement
PTO enforcement
Minimum staffing coverage
Fairness balancing
Successful regeneration after PTO
Scheduling logic must remain highly testable.

CONFIGURATION-DRIVEN RULES
Avoid hardcoded employee-specific logic.
Do NOT implement permanent rules tied to specific employee names.
Instead:
Use configurable priority rules
Use configurable preferences
Use configurable staffing logic
All scheduling rules should be data-driven where possible.

FUTURE-SCOPE REQUIREMENTS
Preserve extensibility for:
AM/PM shifts
Multi-shift support
Multi-location scheduling
Automated notifications
Payroll integration
AI-assisted scheduling recommendations
Advanced optimization algorithms
Shift bidding/trading
Employee preference learning
Analytics dashboards
Future features should be easy to integrate without major rewrites.

PRIORITY RULE ENGINE
The scheduling engine should support configurable priority and preference rules.
These rules must be database-driven and configurable by managers through the admin UI.
Do NOT hardcode employee-specific logic directly into the scheduling engine.
The engine should support:
Preferred employee-task pairings
Employee task avoidance rules
Employee scheduling priority boosts
Preferred shift/day assignments
Minimum or maximum assignment targets
Backup-only employee designations
Skill-based assignment weighting
Example rule types:
"Prefer Employee A for Front Desk"
"Avoid assigning Employee B to Procedures"
"Prioritize Employee C for Civil Surgeon"
"Employee D should only be assigned if necessary"
"Employee E should receive at least 2 Allergy Shot assignments per week"
Implementation Guidance:
Use weighted scoring rather than hardcoded branching logic
Scheduling decisions should combine:
skill compatibility
fairness balancing
availability
staffing minimums
configurable priority weights
Suggested schema:
SchedulingRules
RuleType
EmployeeId
TaskTypeId
Weight/Priority
ActiveStatus
EffectiveDateRange
The rule engine should remain extensible for future advanced optimization features.

INITIAL DEVELOPMENT PRIORITY
Focus first on:
Database schema
Authentication
Employee management
Daily scheduling UI
Scheduling engine
PTO workflow
Coverage engine
Manager overrides
Audit logs
Calendar export
Prioritize maintainability, scalability, and modular architecture over rapid hacks.
The application should be production-ready and architected for long-term expansion.

## Schedule Review And Generation Workflow

The existing deterministic single-day generator remains the scheduling
primitive. Manager range generation is an orchestration layer that:

1. resolves a selected day, clinic week, month, or custom date range
2. skips Sundays and published dates unless overwrite is explicitly confirmed
3. prepares shift blocks, staffing-rule slots, and period-linked background slots
4. runs daily generation in stable ascending date order
5. repairs hard July work-pattern requirements before ordinary BG/hour top-off
6. persists assignments and returns an aggregate shortage/conflict summary

The manager schedule route is the whole-day review surface. It displays every
dated shift block without requiring AM/PM navigation. `/schedule/week` provides
a compact Monday-Saturday review with all employee assignments and week-level
generate/publish/unpublish actions. `/schedule/calendar` provides month-level
draft, published, needs-regeneration, shortage, PTO, and NPTO status.

Easton workbook application treats `Shifts + Hours` as the active reusable
shift-demand source. Every clinic and background count is stored against the
specific shift template where it appears. `Shifts by GY` is the active employee
target source for July work-pattern groups, required BG minimums, and 40-hour
weekly targets. June sheets are ignored by active generation, avoiding both
missing PM demand and duplicated or historical staffing counts.

July work-pattern math is a hard week-level validation layer. Non-endoscopy
groups must receive the exact two configured 5-hour weekday shifts before BG
filler can be used for remaining hour gaps. Monday can satisfy its extra hour
with either the 7:00 AM-12:00 PM block or the 1:00 PM-6:00 PM block; Tuesday
through Thursday require 7:00 AM-12:00 PM. The BG column stays separate as an
employee-level required weekly background minimum.

Manual assignment remains a manager override workflow. Server-side validation
previews skill, PTO/NPTO, availability, overlap, weekly-limit, expected-hours,
and required-coverage warnings. Warned changes require a reason and are written
to the audit log.



