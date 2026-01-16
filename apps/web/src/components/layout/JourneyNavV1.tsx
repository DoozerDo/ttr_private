"use client";

import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import {
  JourneyNavState,
  JourneyStepId,
  JourneyStepState,
  resolveJourneyNavStateFromPathname,
} from "@/src/lib/journeyNav";
import { useJourneyNavAppState } from "@/src/lib/journeyNavStore";
import { routeLookup } from "@/src/navigation/routes";

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
        stroke="var(--signal-burnt-orange)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 13l12 7-12 7"
        stroke="var(--signal-burnt-orange)"
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
  const router = useRouter();
  const pathActiveStepId = resolveJourneyNavStateFromPathname(pathname).activeStepId;
  const { activeOverrideStepId, setActiveOverride } = useJourneyNavAppState();

  const [rippling, setRippling] = useState(false);
  const rippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const shouldPulse = !shouldReduceMotion && !isImpacting;

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
            const showPulse = shouldPulse && isActive;
            const route = routeLookup.get(step.id);
            const routeHref = route?.href;
            const canNavigate = Boolean(routeHref && !isLocked);

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

            const stepContent = (
              <>
                <span className={iconAreaClass}>
                  {showPulse ? <span className="journey-nav-target-pulse" aria-hidden /> : null}
                  {isActive ? <span className="journey-nav-radar-sweep" aria-hidden /> : null}
                  {isCompleted && !isActive ? (
                    <span className="journey-nav-complete-dot" aria-hidden />
                  ) : null}
                  <span className="journey-nav-icon-target" aria-hidden>
                    {isActive ? <span className="journey-nav-icon-center" /> : null}
                  </span>
                  {isActive ? (
                    <ArrowOverlay
                      key={pathActiveStepId}
                      onImpact={triggerRipple}
                      shouldReduceMotion={!!shouldReduceMotion}
                    />
                  ) : null}
                </span>
                <span className="journey-nav-step-label">{step.label}</span>
              </>
            );

            const handleNavigation = () => {
              if (!canNavigate || !routeHref) return;
              router.push(routeHref);
            };

            const handleClick = () => {
              handleNavigation();
              if (isCompleted && Boolean(onStepClick)) {
                handleStepClick(step.id);
              }
            };

            const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
              if (!canNavigate) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleNavigation();
                if (isCompleted && Boolean(onStepClick)) {
                  handleStepClick(step.id);
                }
              }
            };

            return (
              <button
                key={step.id}
                type="button"
                className={nodeClass}
                aria-current={isActive ? "step" : undefined}
                aria-disabled={isLocked}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                disabled={isLocked}
                title={isLocked ? LOCKED_TOOLTIP : undefined}
                role={canNavigate ? "link" : undefined}
                tabIndex={canNavigate ? 0 : undefined}
              >
                {stepContent}
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
          background: linear-gradient(180deg, var(--surface-secondary) 0%, rgba(3, 5, 9, 0.95) 100%);
          border-radius: 1.5rem;
          border: 1px solid var(--metal-edge-outer);
          padding: 1.5rem;
          box-shadow: inset 0 1px 0 var(--metal-edge-highlight), 0 18px 45px rgba(1, 1, 1, 0.65);
        }

        .journey-nav-inner {
          position: relative;
        }

        .journey-nav-line,
        .journey-nav-line-progress {
          position: absolute;
          left: 1.5rem;
          top: 50%;
          height: 2px;
          border-radius: 999px;
          transform: translateY(-50%);
          pointer-events: none;
        }

        .journey-nav-line {
          right: 1.5rem;
          background: linear-gradient(
            90deg,
            rgba(10, 12, 17, 0.9),
            rgba(43, 47, 57, 0.96),
            rgba(10, 12, 17, 0.85)
          );
        }

        .journey-nav-line-progress {
          right: auto;
          width: 0;
          transition: width 0.18s ease-out;
          z-index: 2;
          background: linear-gradient(
            90deg,
            rgba(21, 26, 33, 0.9),
            rgba(194, 77, 12, 0.9),
            rgba(14, 17, 24, 0.85)
          );
          box-shadow: 0 0 18px rgba(194, 77, 12, 0.55);
        }

        .journey-nav-line-progress::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(194, 77, 12, 0.35), rgba(194, 77, 12, 0));
          opacity: 0.6;
          filter: blur(8px);
          pointer-events: none;
          z-index: 1;
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
          gap: 0.35rem;
          color: var(--text-muted-secondary);
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          min-width: 0;
          padding: 0;
          margin: 0;
          pointer-events: auto;
        }

        .journey-nav-step-button:focus-visible {
          outline: 2px solid rgba(194, 77, 12, 0.8);
          outline-offset: 4px;
        }

        .journey-nav-step-locked {
          color: var(--text-muted-tertiary);
          cursor: not-allowed;
        }

        .journey-nav-step-active {
          color: var(--text-muted-primary);
        }

        .journey-nav-step-completed {
          color: var(--text-muted-secondary);
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
          box-shadow: 0 12px 30px rgba(2, 5, 12, 0.45), inset 0 0 12px rgba(255, 255, 255, 0.08);
        }

        .journey-nav-icon-area {
          position: relative;
          width: 64px;
          height: 64px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(
            circle at 30% 30%,
            rgba(255, 255, 255, 0.08),
            rgba(8, 10, 15, 0.96) 65%
          );
          border: 2px solid var(--metal-edge-outer);
          box-shadow: inset 0 2px 8px rgba(255, 255, 255, 0.05),
            inset 0 -6px 18px rgba(0, 0, 0, 0.8), 0 9px 28px rgba(0, 0, 0, 0.65);
          overflow: visible;
          --journey-nav-target-translate: 0px;
          transform: translateY(var(--journey-nav-target-translate)) scale(1);
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease,
            background 0.18s ease;
          pointer-events: none;
        }

        .journey-nav-icon-area::before,
        .journey-nav-icon-area::after {
          content: "";
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
          z-index: 2;
        }

        .journey-nav-icon-area::before {
          inset: 11%;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .journey-nav-icon-area::after {
          inset: 24%;
          border: 1px solid rgba(255, 255, 255, 0.04);
          opacity: 0.55;
        }

        .journey-nav-target-pulse {
          position: absolute;
          inset: -6px;
          border-radius: 999px;
          background: radial-gradient(
            circle,
            rgba(194, 77, 12, 0.35),
            rgba(194, 77, 12, 0)
          );
          pointer-events: none;
          z-index: 0;
          animation: journey-nav-target-pulse 3.4s ease-in-out infinite;
        }

        @keyframes journey-nav-target-pulse {
          0% {
            transform: scale(1);
            opacity: 0.4;
          }
          60% {
            transform: scale(1.08);
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
          border-color: rgba(194, 77, 12, 0.9);
          box-shadow: 0 0 22px rgba(194, 77, 12, 0.45),
            inset 0 2px 8px rgba(255, 255, 255, 0.1), inset 0 -6px 12px rgba(0, 0, 0, 0.7);
          pointer-events: none;
        }

        .journey-nav-step-completed .journey-nav-icon-area {
          box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.9), 0 6px 18px rgba(0, 0, 0, 0.5),
            0 0 12px rgba(194, 77, 12, 0.3);
        }

        .journey-nav-step-locked .journey-nav-icon-area {
          background: radial-gradient(
            circle at 30% 30%,
            rgba(255, 255, 255, 0.04),
            rgba(16, 18, 26, 0.9)
          );
          border-color: rgba(148, 163, 184, 0.35);
          box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.8);
        }

        .journey-nav-radar-sweep {
          position: absolute;
          inset: 12%;
          border-radius: 999px;
          background: conic-gradient(
            from 140deg,
            rgba(194, 77, 12, 0.08),
            rgba(194, 77, 12, 0.65) 30%,
            rgba(194, 77, 12, 0.1) 65%,
            transparent 100%
          );
          animation: radar-rotate 6.4s linear infinite;
          opacity: 0.9;
          pointer-events: none;
          z-index: 1;
        }

        @keyframes radar-rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .journey-nav-complete-dot {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--signal-burnt-orange);
          bottom: 6px;
          right: 8px;
          box-shadow: 0 0 12px rgba(194, 77, 12, 0.65);
          pointer-events: none;
          z-index: 3;
        }

        .journey-nav-icon-target {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          position: relative;
          pointer-events: none;
          z-index: 3;
        }

        .journey-nav-icon-center {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--signal-burnt-orange);
          box-shadow: 0 0 8px rgba(194, 77, 12, 0.75);
          z-index: 4;
        }

        .journey-nav-arrow-overlay {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
          z-index: 5;
        }

        .journey-nav-arrow-overlay svg {
          width: 32px;
          height: 32px;
        }

        .journey-nav-step-label {
          font-size: 0.65rem;
          line-height: 1;
          text-align: center;
          color: var(--text-muted-primary);
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
          background: rgba(194, 77, 12, 0.65);
          box-shadow: 0 0 8px rgba(194, 77, 12, 0.55);
          left: -10%;
        }

        .journey-nav-arrow-head {
          width: 24px;
          height: 8px;
          background: linear-gradient(
            90deg,
            rgba(255, 143, 62, 0.95),
            rgba(194, 77, 12, 0.95)
          );
          clip-path: polygon(0 0, 100% 50%, 0 100%);
          display: inline-block;
          box-shadow: 0 0 12px rgba(194, 77, 12, 0.6);
          transform-origin: center;
        }

        .journey-nav-arrow-fletching {
          position: absolute;
          width: 10px;
          height: 16px;
          right: 12px;
          border-radius: 999px 0 0 999px;
          background: linear-gradient(90deg, rgba(0, 0, 0, 0), rgba(194, 77, 12, 0.5));
          box-shadow: inset 0 0 4px rgba(194, 77, 12, 0.35);
        }
      `}</style>
    </nav>
  );
}
