import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDeploymentEnvStatus } from "../../src/lib/deployment/env";
import {
  isLocalDevAuthAvailable,
  resolveSessionSource,
} from "../../src/lib/auth/session-source";

describe("auth session source priority", () => {
  it("prioritizes a resolved real Auth.js session over local development auth", () => {
    assert.equal(
      resolveSessionSource({
        hasAuthJsSession: true,
        hasResolvedAuthJsActor: true,
        localDevAuthEnabled: true,
        hasDevSwitcherSelection: true,
      }),
      "authjs",
    );
  });

  it("does not fall back to local development auth for an unresolved Auth.js session", () => {
    assert.equal(
      resolveSessionSource({
        hasAuthJsSession: true,
        hasResolvedAuthJsActor: false,
        localDevAuthEnabled: true,
        hasDevSwitcherSelection: true,
      }),
      "none",
    );
  });

  it("uses the dev switcher only when no real Auth.js session is present", () => {
    assert.equal(
      resolveSessionSource({
        hasAuthJsSession: false,
        hasResolvedAuthJsActor: false,
        localDevAuthEnabled: true,
        hasDevSwitcherSelection: true,
      }),
      "dev-switcher",
    );
  });

  it("disables local dev auth outside development", () => {
    assert.equal(
      isLocalDevAuthAvailable({
        nodeEnv: "production",
        disableLocalDevAuth: undefined,
      }),
      false,
    );
  });

  it("disables local dev auth when explicitly disabled", () => {
    assert.equal(
      isLocalDevAuthAvailable({
        nodeEnv: "development",
        disableLocalDevAuth: "true",
      }),
      false,
    );
  });
});

describe("deployment env validation", () => {
  it("requires database, auth, canonical URL, and email variables", () => {
    const status = getDeploymentEnvStatus({
      DATABASE_URL: "",
      AUTH_SECRET: "secret",
      AUTH_URL: "",
      NEXTAUTH_URL: "https://clinic.example",
      EMAIL_SERVER: "smtp://example",
      EMAIL_FROM: "Clinic <noreply@example.com>",
    });

    assert.equal(status.ready, false);
    assert.deepEqual(status.missingLabels, ["DATABASE_URL"]);
  });

  it("accepts AUTH_URL in place of NEXTAUTH_URL", () => {
    const status = getDeploymentEnvStatus({
      DATABASE_URL: "postgresql://example",
      AUTH_SECRET: "secret",
      AUTH_URL: "https://clinic.example",
      EMAIL_SERVER: "smtp://example",
      EMAIL_FROM: "Clinic <noreply@example.com>",
    });

    assert.equal(status.ready, true);
  });
});
