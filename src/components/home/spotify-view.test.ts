import { describe, expect, it } from "vitest";
import { estimateProgress, formatDuration, tintFromPixels } from "./spotify-view";

describe("formatDuration", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(61_900)).toBe("1:01");
    expect(formatDuration(208_000)).toBe("3:28");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("estimateProgress", () => {
  it("advances while playing and stops at the end", () => {
    expect(estimateProgress({ progressMs: 60_000, durationMs: 200_000, playing: true, elapsedMs: 5_000 })).toBe(65_000);
    expect(estimateProgress({ progressMs: 199_000, durationMs: 200_000, playing: true, elapsedMs: 5_000 })).toBe(200_000);
  });
  it("stays still when paused and is null without data", () => {
    expect(estimateProgress({ progressMs: 60_000, durationMs: 200_000, playing: false, elapsedMs: 5_000 })).toBe(60_000);
    expect(estimateProgress({ progressMs: null, durationMs: 200_000, playing: true, elapsedMs: 1 })).toBeNull();
    expect(estimateProgress({ progressMs: 1, durationMs: null, playing: true, elapsedMs: 1 })).toBeNull();
  });
});

describe("tintFromPixels", () => {
  it("averages colourful pixels and ignores near-black and near-white", () => {
    const px = new Uint8ClampedArray([200, 40, 40, 255, 0, 0, 0, 255, 255, 255, 255, 255, 180, 60, 40, 255]);
    expect(tintFromPixels(px)).toBe("rgb(190, 50, 40)");
  });
  it("returns null when nothing usable", () => {
    expect(tintFromPixels(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]))).toBeNull();
    expect(tintFromPixels(new Uint8ClampedArray([200, 40, 40, 0]))).toBeNull();
  });
});
