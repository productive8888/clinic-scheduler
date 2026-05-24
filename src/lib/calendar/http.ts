export function icsResponse(input: { filename: string; body: string }) {
  return new Response(input.body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${input.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
