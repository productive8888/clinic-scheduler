import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDeploymentEnvStatus } from "../src/lib/deployment/env";

for (const file of [".env", ".env.local", ".env.development.local"]) {
  loadEnvFileIfPresent(resolve(process.cwd(), file));
}

const status = getDeploymentEnvStatus(process.env);

console.log("Clinic Scheduler deployment readiness");
console.log("--------------------------------------");

for (const item of status.items) {
  console.log(`${item.configured ? "OK" : "MISSING"} ${item.label}`);
}

if (!status.ready) {
  console.log("");
  console.log(`Missing required variables: ${status.missingLabels.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("All required deployment variables are configured.");
}

function loadEnvFileIfPresent(path: string) {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    process.env[key] = unquote(rawValue);
  }
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
