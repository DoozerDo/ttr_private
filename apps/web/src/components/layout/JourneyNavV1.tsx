"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import {
  JourneyNavState,
  JourneyStepId,
  JourneyStepState,
  resolveJourneyNavStateFromPathname,
} from "@/src/lib/journeyNav";
import { useJourneyNavAppState } from "@/src/lib/journeyNavStore";

export const JOURNEY_NAV_V1_ENABLED =
  process.env.NEXT_PUBLIC_JOURNEY_NAV_V1_ENABLED === "true" ||
  process.env.NODE_ENV === "development";

type ForwardAdvanceCallback = () => void;

type JourneyNavV1Props = {
  state: JourneyNavState;
  onStepClick?: (stepId: JourneyStepId) => void;
  onActiveStepAdvanced?: ForwardAdvanceCallback;
  ariaLabel?: string;
};

const LOCKED_TOOLTIP = "Locked until previous steps are completed.";
const IMPACT_DURATION_MS = 140;
const ARROW_DURATION_MS = 320;
const TARGET_ARROW_FLY_DURATION_MS = 420;

type ArrowFlight = {
  key: number;
  startPercent: number;
  endPercent: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type ArrowOverlayProps = {
  onImpact: () => void;
  shouldReduceMotion: boolean;
};

const ArrowOverlay = ({ onImpact, shouldReduceMotion }: ArrowOverlayProps) => {
  const arrowContent = (
    <svg viewBox="0 0 40 40" role="presentation" aria-hidden="true">
      <path
        d="M4 20h22"
        stroke="#fde68a"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 13l12 7-12 7"
        stroke="#fbbf24"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (shouldReduceMotion) {
    return (
      <div className="journey-nav-arrow-overlay" aria-hidden>
        {arrowContent}
      </div>
    );
  }

  return (
    <motion.div
      className="journey-nav-arrow-overlay"
      initial={{ translateX: -40, translateY: -10, rotate: -12, opacity: 0 }}
      animate={{ translateX: 0, translateY: 0, rotate: 0, opacity: 1 }}
      transition={{ duration: TARGET_ARROW_FLY_DURATION_MS / 1000, ease: "easeOut" }}
      onAnimationComplete={onImpact}
      aria-hidden
    >
      {arrowContent}
    </motion.div>
  );
};

export function JourneyNavV1({
  state,
  onStepClick,
  onActiveStepAdvanced,
  ariaLabel,
}: JourneyNavV1Props) {
  const shouldReduceMotion = useReducedMotion();
  const pathname = usePathname() ?? "/";
  const pathActiveStepId = resolveJourneyNavStateFromPathname(pathname).activeStepId;
  const { activeOverrideStepId, setActiveOverride } = useJourneyNavAppState();
  const [isTyping, setIsTyping] = useState(false);

  const [rippling, setRippling] = useState(false);
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveStepIdRef = useRef<JourneyStepId | null>(null);
  const prevPathnameRef = useRef<string | null>(null);
  const [isImpacting, setIsImpacting] = useState(false);
  const arrowKeyRef = useRef(0);
  const [arrowFlight, setArrowFlight] = useState<ArrowFlight | null>(null);

  const denominator = Math.max(state.steps.length - 1, 1);
  const rawActiveIndex = state.steps.findIndex((step) => step.id === pathActiveStepId);
  const activeIndex = rawActiveIndex < 0 ? 0 : rawActiveIndex;
  const progressPercent =
    state.steps.length === 0
      ? 0
      : state.steps.length === 1
      ? 100
      : clamp((activeIndex / denominator) * 100, 0, 100);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches("input, textarea, [contenteditable='true']") || target.isContentEditable)
      ) {
        setIsTyping(true);
        if (typingTimerRef.current) {
          clearTimeout(typingTimerRef.current);
        }
        typingTimerRef.current = setTimeout(() => {
          setIsTyping(false);
          typingTimerRef.current = null;
        }, 2000);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (impactTimerRef.current) {
      clearTimeout(impactTimerRef.current);
    }
    return () => {
      if (impactTimerRef.current) {
        clearTimeout(impactTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      prevPathnameRef.current &&
      prevPathnameRef.current !== pathname &&
      activeOverrideStepId !== null
    ) {
      setActiveOverride(null);
    }
    prevPathnameRef.current = pathname;
  }, [activeOverrideStepId, pathname, setActiveOverride]);

  const triggerRipple = () => {
    if (shouldReduceMotion) return;
    setRippling(true);
    if (rippleTimerRef.current) {
      clearTimeout(rippleTimerRef.current);
    }
    rippleTimerRef.current = setTimeout(() => {
      setRippling(false);
      rippleTimerRef.current = null;
    }, 420);
  };

  useEffect(() => {
    if (shouldReduceMotion) {
      setRippling(false);
    }
  }, [shouldReduceMotion]);

  useEffect(() => {
    return () => {
      if (rippleTimerRef.current) {
        clearTimeout(rippleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!state.steps.length) {
      prevActiveStepIdRef.current = null;
      return;
    }

    const previousStepId = prevActiveStepIdRef.current;
    const previousIndex =
      previousStepId === null ? -1 : state.steps.findIndex((step) => step.id === previousStepId);
    const currentIndex = state.steps.findIndex((step) => step.id === pathActiveStepId);

    prevActiveStepIdRef.current = pathActiveStepId;

    const isForward = previousIndex >= 0 && currentIndex > previousIndex;

    if (isForward && !shouldReduceMotion && state.steps.length > 1) {
      const startPercent = clamp((previousIndex / denominator) * 100 - 3, 0, 100);
      const endPercent = clamp((currentIndex / denominator) * 100, 0, 100);
      arrowKeyRef.current += 1;
      setArrowFlight({ key: arrowKeyRef.current, startPercent, endPercent });
      setIsImpacting(false);
      return;
    }

    if (shouldReduceMotion && isForward) {
      onActiveStepAdvanced?.();
    }
  }, [
    denominator,
    onActiveStepAdvanced,
    pathActiveStepId,
    shouldReduceMotion,
    state.steps,
    state.steps.length,
  ]);

  const handleArrowComplete = () => {
    setArrowFlight(null);
    setIsImpacting(true);
    if (impactTimerRef.current) {
      clearTimeout(impactTimerRef.current);
    }
    impactTimerRef.current = setTimeout(() => {
      setIsImpacting(false);
      onActiveStepAdvanced?.();
    }, IMPACT_DURATION_MS);
  };

  const shouldPulse = !shouldReduceMotion && !isTyping && !isImpacting;

  const handleStepClick = (stepId: JourneyStepId) => {
    if (!onStepClick) return;
    onStepClick(stepId);
  };

  return (
    <nav
      aria-label={ariaLabel ?? "Current journey progress"}
      className="journey-nav-root relative w-full"
    >
      <div className="journey-nav-inner relative">
        <span className="journey-nav-line" aria-hidden />
        <span
          className="journey-nav-line-progress"
          style={{ width: `${progressPercent}%` }}
          aria-hidden
        />

        <div className="journey-nav-step-grid">
          {state.steps.map((step) => {
            const isActive = step.id === pathActiveStepId;
            const isCompleted = step.state === JourneyStepState.Completed;
            const isLocked = step.state === JourneyStepState.Locked;
            const isClickable = isCompleted && Boolean(onStepClick);
            const showPulse = shouldPulse && isActive;

            const nodeClass = [
              "journey-nav-step-button",
              isActive ? "journey-nav-step-active" : "",
              isCompleted ? "journey-nav-step-completed" : "",
              isLocked ? "journey-nav-step-locked" : "",
              isActive && isImpacting ? "journey-nav-step-impact" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const iconAreaClass = [
              "journey-nav-icon-area",
              isActive && rippling ? "journey-nav-icon-area--ripple" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={step.id}
                type="button"
                className={nodeClass}
                aria-current={isActive ? "step" : undefined}
                aria-disabled={isLocked}
                onClick={() => {
                  if (isClickable) handleStepClick(step.id);
                }}
                disabled={isLocked}
                title={isLocked ? LOCKED_TOOLTIP : undefined}
              >
                <span className={iconAreaClass}>
                  {showPulse ? <span className="journey-nav-target-pulse" aria-hidden /> : null}
                  {isActive ? (
                    <ArrowOverlay
                      key={pathActiveStepId}
                      onImpact={triggerRipple}
                      shouldReduceMotion={!!shouldReduceMotion}
                    />
                  ) : null}
                  <span className="journey-nav-icon-target" aria-hidden>
                    {isActive ? <span className="journey-nav-icon-center" /> : null}
                  </span>
                </span>
                <span className="journey-nav-step-label">{step.label}</span>
              </button>
            );
          })}
        </div>

        <div className="journey-nav-arrow-wrapper" aria-hidden>
          <AnimatePresence>
            {arrowFlight && (
              <motion.span
                key={arrowFlight.key}
                className="journey-nav-arrow"
                initial={{
                  left: `${arrowFlight.startPercent}%`,
                  opacity: 1,
                }}
                animate={{
                  left: `${arrowFlight.endPercent}%`,
                  opacity: [1, 1, 0],
                  scale: [1, 1.04, 1],
                }}
                transition={{
                  left: { duration: ARROW_DURATION_MS / 1000, ease: "easeOut" },
                  opacity: {
                    duration: 0.12,
                    delay: ARROW_DURATION_MS / 1000 + 0.15,
                  },
                  scale: {
                    duration: 0.18,
                    delay: ARROW_DURATION_MS / 1000,
                    ease: "easeOut",
                  },
                }}
                onAnimationComplete={handleArrowComplete}
              >
                <span className="journey-nav-arrow-shaft" />
                <span className="journey-nav-arrow-head" />
                <span className="journey-nav-arrow-fletching" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style jsx>{`
        .journey-nav-root {
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.7));
          border: 1px solid rgba(148, 163, 184, 0.4);
          border-radius: 1rem;
          padding: 1.25rem;
          box-shadow: 0 10px 35px rgba(2, 6, 23, 0.65);
          backdrop-filter: blur(14px);
        }

        .journey-nav-inner {
          position: relative;
        }

        .journey-nav-line,
        .journey-nav-line-progress {
          position: absolute;
          left: 1rem;
          top: 50%;
          height: 2px;
          border-radius: 999px;
          transform: translateY(-50%);
          pointer-events: none;
        }

        .journey-nav-line {
          right: 1rem;
          background: linear-gradient(90deg, rgba(55, 65, 81, 0.6), rgba(15, 23, 42, 0.2));
        }

        .journey-nav-line-progress {
          right: auto;
          transition: width 0.18s ease-out;
          background: linear-gradient(90deg, #c084fc, #8b5cf6 65%);
        }

        .journey-nav-step-grid {
          position: relative;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          pointer-events: none;
        }

        .journey-nav-step-button {
          background: transparent;
          border: none;
          display: flex;
          cursor: pointer;
          flex: 1;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          color: rgba(226, 232, 240, 0.9);
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          min-width: 0;
          padding: 0;
          margin: 0;
          pointer-events: auto;
        }

        .journey-nav-step-button:focus-visible {
          outline: 2px solid rgba(99, 102, 241, 0.8);
          outline-offset: 4px;
        }

        .journey-nav-step-locked {
          color: rgba(148, 163, 184, 0.6);
          cursor: not-allowed;
        }

        .journey-nav-step-active {
          color: #f8fafc;
        }

        .journey-nav-step-completed {
          color: rgba(164, 202, 254, 0.9);
        }

        .journey-nav-step-impact .journey-nav-icon-area {
          animation: impact-pulse ${IMPACT_DURATION_MS}ms ease-out;
        }

        @keyframes impact-pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
          }
        }

        .journey-nav-step-button:not(.journey-nav-step-locked):hover .journey-nav-icon-area {
          box-shadow: 0 12px 30px rgba(148, 163, 184, 0.25),
            inset 0 0 12px rgba(226, 232, 240, 0.25);
        }

        .journey-nav-icon-area {
          position: relative;
          width: 56px;
          height: 56px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(
            circle,
            rgba(15, 23, 42, 0.95) 0%,
            rgba(15, 23, 42, 0.95) 32%,
            rgba(79, 70, 229, 0.2) 33%,
            rgba(79, 70, 229, 0.2) 46%,
            rgba(30, 41, 59, 0.85) 47%,
            rgba(30, 41, 59, 0.85) 100%
          );
          border: 2px solid rgba(99, 102, 241, 0.35);
          box-shadow: inset 0 0 12px rgba(15, 23, 42, 0.85),
            inset 0 8px 20px rgba(15, 23, 42, 0.8), 0 8px 32px rgba(2, 6, 23, 0.75);
          --journey-nav-target-translate: 0px;
          transform: translateY(var(--journey-nav-target-translate)) scale(1);
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease,
            background 0.18s ease;
          overflow: visible;
        }

        .journey-nav-icon-area::after {
          content: "";
          position: absolute;
          inset: 8px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          pointer-events: none;
        }

        .journey-nav-target-pulse {
          position: absolute;
          inset: -6px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(129, 140, 248, 0.5), rgba(99, 102, 241, 0));
          pointer-events: none;
          z-index: 0;
          animation: journey-nav-target-pulse 2.5s ease-in-out infinite;
        }

        @keyframes journey-nav-target-pulse {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          45% {
            transform: scale(1.12);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }

        .journey-nav-icon-area--ripple {
          animation: journey-nav-target-ripple 0.42s ease-out both;
        }

        @keyframes journey-nav-target-ripple {
          0% {
            transform: translateY(var(--journey-nav-target-translate, 0px)) scale(1);
          }
          60% {
            transform: translateY(var(--journey-nav-target-translate, 0px)) scale(1.06);
          }
          100% {
            transform: translateY(var(--journey-nav-target-translate, 0px)) scale(1);
          }
        }

        .journey-nav-step-active .journey-nav-icon-area {
          border-color: #c4b5fd;
          box-shadow: 0 0 25px rgba(129, 140, 248, 0.45),
            inset 0 0 20px rgba(129, 140, 248, 0.35);
          --journey-nav-target-translate: -1px;
          background: radial-gradient(
            circle,
            rgba(255, 255, 255, 0.95) 0%,
            rgba(255, 255, 255, 0.95) 10%,
            rgba(251, 191, 36, 0.95) 11%,
            rgba(251, 191, 36, 0.95) 20%,
            rgba(192, 132, 252, 0.95) 21%,
            rgba(192, 132, 252, 0.95) 30%,
            rgba(129, 140, 248, 0.9) 31%,
            rgba(129, 140, 248, 0.9) 45%,
            rgba(15, 23, 42, 0.95) 46%,
            rgba(15, 23, 42, 0.95) 100%
          );
        }

        .journey-nav-step-completed .journey-nav-icon-area {
          background: radial-gradient(
            circle,
            rgba(226, 232, 240, 0.9) 0%,
            rgba(226, 232, 240, 0.9) 10%,
            rgba(148, 163, 184, 0.45) 10%,
            rgba(148, 163, 184, 0.45) 28%,
            rgba(99, 102, 241, 0.4) 28%,
            rgba(99, 102, 241, 0.4) 48%,
            rgba(15, 23, 42, 0.9) 49%,
            rgba(15, 23, 42, 0.9) 100%
          );
          box-shadow: inset 0 0 14px rgba(8, 11, 21, 0.8), 0 6px 18px rgba(2, 6, 23, 0.6);
        }

        .journey-nav-step-locked .journey-nav-icon-area {
          background: radial-gradient(
            circle,
            rgba(148, 163, 184, 0.45) 0%,
            rgba(148, 163, 184, 0.45) 28%,
            rgba(30, 41, 59, 0.85) 29%,
            rgba(30, 41, 59, 0.85) 100%
          );
          border-color: rgba(148, 163, 184, 0.35);
          box-shadow: inset 0 0 10px rgba(15, 23, 42, 0.8);
        }

        .journey-nav-icon-target {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          position: relative;
          pointer-events: none;
          z-index: 1;
        }

        .journey-nav-icon-center {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(135deg, #f3e8ff, #c084fc);
          box-shadow: 0 0 8px rgba(192, 132, 252, 0.7);
          z-index: 2;
        }

        .journey-nav-arrow-overlay {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
          z-index: 3;
        }

        .journey-nav-arrow-overlay svg {
          width: 32px;
          height: 32px;
        }

        .journey-nav-step-label {
          font-size: 0.65rem;
          line-height: 1;
          text-align: center;
        }

        .journey-nav-arrow-wrapper {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          pointer-events: none;
          height: 0;
        }

        .journey-nav-arrow {
          position: absolute;
          transform: translate(-50%, -50%);
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          z-index: 30;
        }

        .journey-nav-arrow-shaft {
          position: absolute;
          width: 64%;
          height: 3px;
          background: linear-gradient(90deg, rgba(192, 132, 252, 0.25), rgba(99, 102, 241, 0.85));
          left: -10%;
        }

        .journey-nav-arrow-head {
          width: 24px;
          height: 8px;
          background: linear-gradient(90deg, #c084fc, #8b5cf6);
          clip-path: polygon(0 0, 100% 50%, 0 100%);
          display: inline-block;
          box-shadow: 0 0 12px rgba(192, 132, 252, 0.65);
          transform-origin: center;
        }

        .journey-nav-arrow-fletching {
          position: absolute;
          width: 10px;
          height: 16px;
          right: 12px;
          border-radius: 999px 0 0 999px;
          background: linear-gradient(90deg, rgba(129, 140, 248, 0), rgba(129, 140, 248, 0.5));
          box-shadow: inset 0 0 4px rgba(99, 102, 241, 0.7);
        }
      `}</style>
    </nav>
  );
}
