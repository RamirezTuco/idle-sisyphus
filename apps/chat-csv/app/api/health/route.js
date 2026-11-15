export function GET() {
  return Response.json({ status: "ok", application: "chat-csv" }, {
    headers: { "Cache-Control": "no-store" }
  });
}
