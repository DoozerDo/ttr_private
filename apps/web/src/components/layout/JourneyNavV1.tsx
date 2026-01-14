"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { JourneyNavState, JourneyStepId, JourneyStepState } from "@/src/lib/journeyNav";

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
const IDLE_PULSE_MIN_MS = 2200;
const IDLE_PULSE_MAX_MS = 2800;
const IMPACT_DURATION_MS = 140;
const ARROW_DURATION_MS = 320;

type ArrowFlight = {
  key: number;
  startPercent: number;
  endPercent: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function createPulseDuration() {
  return IDLE_PULSE_MIN_MS + Math.random() * (IDLE_PULSE_MAX_MS - IDLE_PULSE_MIN_MS);
}

export function JourneyNavV1({
  state,
  onStepClick,
  onActiveStepAdvanced,
  ariaLabel,
}: JourneyNavV1Props) {
  const shouldReduceMotion = useReducedMotion();
  const [isTyping, setIsTyping] = useState(false);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveIndexRef = useRef<number | null>(null);
  const hasMountedRef = useRef(false);
  const pulseDuration = useMemo(() => createPulseDuration(), []);
  const [isImpacting, setIsImpacting] = useState(false);
  const arrowKeyRef = useRef(0);
  const [arrowFlight, setArrowFlight] = useState<ArrowFlight | null>(null);

  const denominator = Math.max(state.steps.length - 1, 1);
  const rawActiveIndex = state.steps.findIndex((step) => step.id === state.activeStepId);
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
    if (!state.steps.length) {
      return;
    }

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevActiveIndexRef.current = activeIndex;
      return;
    }

    const previousIndex = prevActiveIndexRef.current ?? activeIndex;
    const isForward = activeIndex > previousIndex;
    prevActiveIndexRef.current = activeIndex;

    // Do not animate arrows if reduced motion is requested or there is no forward progression.
    if (shouldReduceMotion || !isForward || state.steps.length < 2) {
      if (shouldReduceMotion && isForward) {
        onActiveStepAdvanced?.();
      }
      return;
    }

    const startPercent = clamp((previousIndex / denominator) * 100 - 3, 0, 100);
    const endPercent = clamp((activeIndex / denominator) * 100, 0, 100);
    arrowKeyRef.current += 1;
    setArrowFlight({ key: arrowKeyRef.current, startPercent, endPercent });
    setIsImpacting(false);
  }, [activeIndex, denominator, onActiveStepAdvanced, shouldReduceMotion, state.steps.length]);

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
            const isActive = step.state === JourneyStepState.Active;
            const isCompleted = step.state === JourneyStepState.Completed;
            const isLocked = step.state === JourneyStepState.Locked;
            const isClickable = !isLocked && Boolean(onStepClick);

            const nodeClass = [
              "journey-nav-step-button",
              isActive ? "journey-nav-step-active" : "",
              isCompleted ? "journey-nav-step-completed" : "",
              isLocked ? "journey-nav-step-locked" : "",
              isActive && isImpacting ? "journey-nav-step-impact" : "",
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
                <span className="journey-nav-icon-area">
                  <span className="journey-nav-icon-ring outer" />
                  <span className="journey-nav-icon-ring inner" />
                  {isActive && shouldPulse ? (
                    <motion.span
                      className="journey-nav-icon-pulse"
                      aria-hidden
                      initial={false}
                      animate="pulse"
                      variants={{
                        pulse: {
                          scale: [1, 1.08, 1],
                          opacity: [0.6, 0, 0.6],
                          transition: {
                            duration: pulseDuration / 1000,
                            ease: "easeInOut",
                            repeat: Infinity,
                          },
                        },
                      }}
                    />
                  ) : null}
                  {isCompleted ? (
                    <span className="journey-nav-icon-check" aria-hidden>
                      <svg viewBox="0 0 24 24" role="presentation">
                        <path d="M6 12l4 4 8-8" />
                      </svg>
                    </span>
                  ) : (
                    <span className="journey-nav-icon-target" aria-hidden>
                      {isActive ? <span className="journey-nav-icon-center" /> : null}
                    </span>
                  )}
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
                  opacity: [1, 0],
                }}
                transition={{
                  left: { duration: ARROW_DURATION_MS / 1000, ease: "easeOut" },
                  opacity: { duration: 0.05, delay: (ARROW_DURATION_MS - 50) / 1000 },
                }}
                onAnimationComplete={handleArrowComplete}
              >
                <span className="journey-nav-arrow-head" />
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
          background: linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(20, 28, 45, 0.7));
          box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.05),
            inset 0 15px 20px rgba(15, 23, 42, 0.7), 0 5px 15px rgba(2, 6, 23, 0.65);
        }

        .journey-nav-icon-pulse {
          position: absolute;
          width: 64px;
          height: 64px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(192, 132, 252, 0.4), rgba(99, 102, 241, 0));
          pointer-events: none;
        }

        .journey-nav-icon-ring {
          position: absolute;
          border: 1px solid rgba(148, 163, 184, 0.5);
          border-radius: 999px;
        }

        .journey-nav-icon-ring.outer {
          width: 48px;
          height: 48px;
        }

        .journey-nav-icon-ring.inner {
          width: 36px;
          height: 36px;
        }

        .journey-nav-step-active .journey-nav-icon-ring.outer,
        .journey-nav-step-active .journey-nav-icon-ring.inner {
          border-color: #c4b5fd;
        }

        .journey-nav-step-active .journey-nav-icon-area {
          box-shadow: 0 0 25px rgba(129, 140, 248, 0.55),
            inset 0 0 12px rgba(129, 140, 248, 0.3);
        }

        .journey-nav-step-completed .journey-nav-icon-area {
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 1));
          box-shadow: inset 0 0 12px rgba(226, 232, 240, 0.2);
        }

        .journey-nav-icon-target {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          position: relative;
        }

        .journey-nav-icon-center {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: linear-gradient(135deg, #f3e8ff, #c084fc);
          box-shadow: 0 0 8px rgba(192, 132, 252, 0.7);
        }

        .journey-nav-icon-check {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .journey-nav-icon-check svg {
          width: 32px;
          height: 32px;
          stroke: #a5f3fc;
          stroke-width: 2.5;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
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
        }

        .journey-nav-arrow-head {
          width: 24px;
          height: 8px;
          background: linear-gradient(90deg, #c084fc, #8b5cf6);
          clip-path: polygon(0 0, 100% 50%, 0 100%);
          display: inline-block;
          transform-origin: center;
        }
      `}</style>
    </nav>
  );
}
