import { describe, expect, it } from "vitest";
import { ANDROID_PACKAGE, buildAssetLinks, parseFingerprints } from "./assetlinks";

const FP = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

describe("assetlinks", () => {
  it("tom lista utan avtryck, annars en länk med paketet", () => {
    expect(buildAssetLinks(ANDROID_PACKAGE, [])).toEqual([]);
    expect(buildAssetLinks(ANDROID_PACKAGE, [FP])).toEqual([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "lenovohomescreen.app", sha256_cert_fingerprints: [FP] } }]);
  });
  it("tolkar kommaseparerade avtryck, gemener blir versaler, trasiga och dubbletter försvinner", () => {
    expect(parseFingerprints(`${FP.toLowerCase()}, ${FP}, inte-ett-avtryck, 12:34`)).toEqual([FP]);
    expect(parseFingerprints(undefined)).toEqual([]);
    expect(parseFingerprints(`${FP},${FP.replace("14", "15")}`)).toHaveLength(2);
  });
});
