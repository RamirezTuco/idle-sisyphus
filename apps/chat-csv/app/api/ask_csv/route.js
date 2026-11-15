import { createHandlers } from "../../../lib/server/handlers.js";

export const runtime = "nodejs";
export const maxDuration = 90;
export const POST = createHandlers().POST;
