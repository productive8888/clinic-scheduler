import { applyEastonDefaultsFromWorkbook } from "../src/lib/db/easton-import";

async function main() {
  const workbookPath = process.argv[2] ?? null;

  if (workbookPath === "--help" || workbookPath === "-h") {
    console.log(
      [
        "Usage: npm run apply:easton -- [workbook-path]",
        "",
        "Applies the private Easton scheduling workbook defaults to the database",
        "configured by DATABASE_URL. The workbook is never committed; place it in",
        "private/New Easton Scheduling.xlsx, private/easton-scheduling.xlsx,",
        "private/Copy of Easton Scheduling.xlsx, or pass an explicit local path.",
      ].join("\n"),
    );
    return;
  }

  const result = await applyEastonDefaultsFromWorkbook({
    actorEmployeeId: null,
    workbookPath,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
