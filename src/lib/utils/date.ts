export function toIsoDate(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function todayIsoDate() {
  return toIsoDate(new Date());
}

export function formatDisplayDate(value: Date | string) {
  const date = typeof value === "string" ? parseIsoDate(value) : value;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
