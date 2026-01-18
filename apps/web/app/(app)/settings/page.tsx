"use client";

import { useAutoGenerateThreshold } from "../lib/settings";
import { AUTO_GENERATE_THRESHOLD } from "../lib/autoGenerateThreshold";
import { ttrComponents } from "../ui/ttrStyles";

export default function SettingsPage() {
  const [autoGenerateThreshold] = useAutoGenerateThreshold();

  const thresholdValue =
    typeof autoGenerateThreshold === "number"
      ? autoGenerateThreshold
      : AUTO_GENERATE_THRESHOLD;

  return (
    <div
      style={{
        ...ttrComponents.basePanel,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 720,
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Account capabilities and system defaults.
        </p>
      </div>

      <div className="space-y-3 text-sm text-slate-200">
        <div className="flex justify-between">
          <span>Auto generate threshold</span>
          <span className="font-semibold">{thresholdValue}</span>
        </div>
      </div>
    </div>
  );
}
