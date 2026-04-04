import { describe, expect, it } from "vitest";

import {
  CALIBRATION_PROFILE_OPTIONS,
  type CalibrationProfile,
} from "@/lib/calibration/profiles";

describe("calibration profile options", () => {
  const expectedProfiles: CalibrationProfile[] = ["balanced", "conservative", "aggressive"];

  it("exposes an option for every supported profile", () => {
    const configuredProfiles = CALIBRATION_PROFILE_OPTIONS.map((option) => option.value);
    expect(new Set(configuredProfiles)).toEqual(new Set(expectedProfiles));
  });

  it("does not duplicate profile entries", () => {
    const configuredProfiles = CALIBRATION_PROFILE_OPTIONS.map((option) => option.value);
    const uniqueCount = new Set(configuredProfiles).size;
    expect(uniqueCount).toBe(configuredProfiles.length);
  });
});
