export function backgroundTaskDisplayName(input: {
  name: string;
  isBackground: boolean;
}) {
  if (!input.isBackground || input.name.endsWith("(Background)")) {
    return input.name;
  }

  return `${input.name} (Background)`;
}
