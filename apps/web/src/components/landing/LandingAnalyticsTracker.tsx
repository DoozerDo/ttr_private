"use client";

import { useEffect, useRef } from "react";
import { detectDeviceType, trackEvent } from "@/src/lib/analytics";

export function LandingAnalyticsTracker() {
  const trackedViewRef = useRef(false);

  useEffect(() => {
    if (trackedViewRef.current) {
      return;
    }
    trackedViewRef.current = true;

    trackEvent("landing_viewed", {
      referrer: document.referrer || null,
      deviceType: detectDeviceType(),
    });
  }, []);

  return null;
}
