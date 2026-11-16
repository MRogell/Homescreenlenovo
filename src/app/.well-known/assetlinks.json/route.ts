import { NextResponse } from "next/server";
import { ANDROID_PACKAGE, buildAssetLinks, parseFingerprints } from "@/lib/assetlinks";

export const dynamic = "force-dynamic";

/** Digital Asset Links för Android-appen. Avtrycken sätts i miljövariabeln ANDROID_SHA256_FINGERPRINTS (se android/ANDROID.md). */
export function GET() {
  return NextResponse.json(buildAssetLinks(ANDROID_PACKAGE, parseFingerprints(process.env.ANDROID_SHA256_FINGERPRINTS)), { headers: { "Cache-Control": "public, max-age=300" } });
}
