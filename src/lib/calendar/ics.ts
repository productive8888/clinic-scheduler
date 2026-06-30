import { addDaysIsoDate, parseIsoDate } from "@/lib/utils/date";
import { formatMinuteOfDay } from "@/lib/utils/time";
import type { CalendarAssignmentEvent } from "./events";

const PROD_ID = "-//Clinic Scheduler//Schedule Calendar//EN";

export function buildIcsCalendar(input: {
  calendarName: string;
  events: CalendarAssignmentEvent[];
  generatedAt?: Date;
}) {
  const generatedAt = input.generatedAt ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PROD_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
  ];

  for (const event of input.events) {
    lines.push(...buildEventLines(event, generatedAt));
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function buildEventLines(event: CalendarAssignmentEvent, generatedAt: Date) {
  const summary = `${event.taskTypeName} - ${event.employeeName}`;
  const description = [
    `Task: ${event.taskTypeName}`,
    `Employee: ${event.employeeName}`,
    `Work type: ${formatEnumLabel(event.workCategory)}`,
    event.shiftLabel ? `Shift: ${event.shiftLabel}` : null,
    event.shiftCategory
      ? `Shift category: ${formatEnumLabel(event.shiftCategory)}`
      : null,
    `Date: ${event.date}`,
    `Time: ${formatEventTime(event)}`,
    `Scenario: ${formatEnumLabel(String(event.scenario))}`,
    event.slotLabel ? `Slot: ${event.slotLabel}` : null,
    event.assignmentSource ? `Source: ${formatEnumLabel(event.assignmentSource)}` : null,
    event.locked ? "Locked manual assignment: yes" : null,
    event.slotNotes ? `Notes: ${event.slotNotes}` : null,
  ].filter(Boolean) as string[];

  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(`${event.assignmentId}@clinic-scheduler`)}`,
    `DTSTAMP:${formatUtcDateTime(generatedAt)}`,
  ];

  if (hasTimedRange(event)) {
    lines.push(`DTSTART:${formatSlotDateTime(event.date, event.startMinute ?? 0)}`);
    lines.push(`DTEND:${formatSlotDateTime(event.date, event.endMinute ?? 24 * 60)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${event.date.replaceAll("-", "")}`);
    lines.push(`DTEND;VALUE=DATE:${addDaysIsoDate(event.date, 1).replaceAll("-", "")}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(summary)}`);
  lines.push(`DESCRIPTION:${escapeIcsText(description.join("\\n"))}`);
  lines.push(
    `CATEGORIES:${escapeIcsText(event.workCategory)},${escapeIcsText(
      event.taskTypeName,
    )}`,
  );

  if (event.employeeEmail) {
    lines.push(
      `ATTENDEE;CN=${escapeIcsParam(event.employeeName)}:mailto:${event.employeeEmail}`,
    );
  }

  if (event.updatedAt) {
    lines.push(`LAST-MODIFIED:${formatUtcDateTime(new Date(event.updatedAt))}`);
  }

  lines.push("END:VEVENT");

  return lines;
}

function hasTimedRange(event: CalendarAssignmentEvent) {
  return event.startMinute !== null && event.startMinute !== undefined &&
    event.endMinute !== null && event.endMinute !== undefined;
}

function formatSlotDateTime(date: string, minute: number) {
  const parsed = parseIsoDate(date);
  parsed.setUTCMinutes(minute);

  return formatUtcDateTime(parsed);
}

function formatUtcDateTime(date: Date) {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const hour = date.getUTCHours().toString().padStart(2, "0");
  const minute = date.getUTCMinutes().toString().padStart(2, "0");
  const second = date.getUTCSeconds().toString().padStart(2, "0");

  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function formatEventTime(event: CalendarAssignmentEvent) {
  const start = formatMinuteOfDay(event.startMinute);
  const end = formatMinuteOfDay(event.endMinute);

  return start && end ? `${start}-${end}` : "All day";
}

function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

function escapeIcsParam(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function foldIcsLine(line: string) {
  if (line.length <= 75) {
    return line;
  }

  const chunks: string[] = [];
  let remaining = line;

  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = remaining.slice(75);
  }

  chunks.push(remaining);

  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
