export function timeStringToMinute(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [hourValue, minuteValue] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("Invalid time value");
  }

  return hour * 60 + minute;
}

export function minuteToTimeInput(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  const hour = Math.floor(value / 60);
  const minute = value % 60;

  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

export function formatMinuteOfDay(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const displayHour = hour % 12 || 12;
  const suffix = hour < 12 ? "AM" : "PM";

  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function formatCompactMinuteRange(startMinute: number, endMinute: number) {
  return `${compactMinute(startMinute)}-${compactMinute(endMinute)}`;
}

function compactMinute(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;

  return `${hour.toString().padStart(2, "0")}${minute
    .toString()
    .padStart(2, "0")}`;
}
