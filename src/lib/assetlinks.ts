/** Android-appens paketnamn (Trusted Web Activity). Måste vara detsamma som i Google Play. */
export const ANDROID_PACKAGE = "lenovohomescreen.app";

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** Tolkar SHA-256-avtryck (kommaseparerade) och släpper igenom bara välformade, i versaler. */
export function parseFingerprints(raw: string | undefined): string[] {
  return [...new Set((raw ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => FINGERPRINT.test(s)))];
}

/** Innehållet i /.well-known/assetlinks.json: kopplar webbplatsen till Android-appen så att appen visas utan adressfält. */
export function buildAssetLinks(pkg: string, fingerprints: string[]) {
  if (fingerprints.length === 0) return [];
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints } }];
}
