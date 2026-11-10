import { NextResponse, type NextRequest } from "next/server";
import { handlePreheatCron } from "@/server/departure/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run(req: NextRequest) {
  const r = await handlePreheatCron({ authorization: req.headers.get("authorization") }, process.env.CRON_SECRET);
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
export const GET = run;
export const POST = run;
