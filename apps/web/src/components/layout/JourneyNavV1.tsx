"use client";

import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, type KeyboardEvent, type ReactElement } from "react";

import {
  JourneyNavState,
  JourneyStepId,
  JourneyStepState,
  resolveJourneyNavStateFromPathname,
} from "@/src/lib/journeyNav";
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
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const renderStepIcon = (stepId: JourneyStepId): ReactElement | null => {
  if (stepId === "baselines") {
    return (
      <svg
        viewBox="0 0 24 24"
        role="presentation"
        strokeWidth="1.5"
        stroke="currentColor"
        fill="none"
      >
        <circle cx="12" cy="12" r="8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (stepId === "resume") {
    return (
      <svg
        viewBox="0 0 24 24"
        role="presentation"
        strokeWidth="1.6"
        stroke="currentColor"
        fill="none"
      >
        <path d="M6 4h8l5 5v11H6z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 4v6h6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 11h8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 15h8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 19h5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (stepId === "jobTracker") {
    return (
      <svg
        viewBox="0 0 24 24"
        role="presentation"
        strokeWidth="1.4"
        stroke="currentColor"
        fill="none"
      >
        <rect
          x="6"
          y="4"
          width="12"
          height="16"
          rx="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9.5 8h5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.5 12h5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.5 16h3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 6c1 0 1 1.5 0 1.5" strokeLinecap="round" />
        <path d="M5 10c1 0 1 1.5 0 1.5" strokeLinecap="round" />
        <path d="M5 14c1 0 1 1.5 0 1.5" strokeLinecap="round" />
        <path d="M5 18c1 0 1 1.5 0 1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (stepId === "interviewToolkit") {
    return (
      <svg
        viewBox="0 0 24 24"
        role="presentation"
        strokeWidth="1.6"
        stroke="currentColor"
        fill="none"
      >
        <path d="M5 8h14v8H9l-4 4z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 10h10" strokeLinecap="round" />
        <path d="M7 14h6" strokeLinecap="round" />
      </svg>
    );
  }

  return null;
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

  // Active step is route-driven.
  const pathActiveStepId = resolveJourneyNavStateFromPathname(pathname).activeStepId;

  const prevActiveStepIdRef = useRef<JourneyStepId | null>(null);

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
    if (isForward) {
      onActiveStepAdvanced?.();
    }
  }, [onActiveStepAdvanced, pathActiveStepId, state.steps]);

  const shouldPulse = !shouldReduceMotion;

  const handleStepClick = (stepId: JourneyStepId) => {
    if (!onStepClick) return;
    onStepClick(stepId);
  };

  return (
    <nav
      aria-label={ariaLabel ?? "Current journey progress"}
      className="journey-nav-root relative w-full"
    >
      <div key={pathname} className="journey-nav-clip-shell">
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
              ]
                .filter(Boolean)
                .join(" ");

              const iconAreaClass = [
                "journey-nav-icon-area",
                isActive ? "ttr-active-ring-pulse" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const stepContent = (
                <>
                  <span className={iconAreaClass}>
                    {showPulse ? (
                      <span className="journey-nav-target-pulse" aria-hidden />
                    ) : null}

                    {isActive ? <span className="journey-nav-radar-sweep" aria-hidden /> : null}

                    <span className="journey-nav-icon-target" aria-hidden>
                      {renderStepIcon(step.id)}
                    </span>
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
                  tabIndex={canNavigate ? 0 : -1}
                >
                  {stepContent}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .journey-nav-root {
          background: var(--surface-secondary);
          background-image: none;
          border-radius: 1.5rem;
          border: 1px solid var(--metal-edge-outer);
          padding: 0;
          box-shadow: inset 0 1px 0 var(--metal-edge-highlight),
            0 18px 45px rgba(1, 1, 1, 0.65);
        }

        .journey-nav-root::before,
        .journey-nav-root::after {
          content: none;
        }

        .journey-nav-clip-shell {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          border-radius: inherit;
          padding: 1.5rem;
          background: linear-gradient(
            180deg,
            var(--surface-secondary) 0%,
            rgba(3, 5, 9, 0.95) 100%
          );
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

        .journey-nav-step-button:not(.journey-nav-step-locked):hover .journey-nav-icon-area {
          box-shadow: 0 12px 30px rgba(2, 5, 12, 0.45),
            inset 0 0 12px rgba(255, 255, 255, 0.08);
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
            inset 0 -6px 18px rgba(0, 0, 0, 0.8),
            0 9px 28px rgba(0, 0, 0, 0.65);
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

        .journey-nav-step-active .journey-nav-icon-area {
          border-color: rgba(194, 77, 12, 0.9);
          box-shadow: 0 0 22px rgba(194, 77, 12, 0.45),
            inset 0 2px 8px rgba(255, 255, 255, 0.1),
            inset 0 -6px 12px rgba(0, 0, 0, 0.7);
          pointer-events: none;
        }

        .journey-nav-step-completed .journey-nav-icon-area {
          box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.9),
            0 6px 18px rgba(0, 0, 0, 0.5),
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

        .journey-nav-icon-target svg {
          position: absolute;
          inset: 2px;
          width: calc(100% - 4px);
          height: calc(100% - 4px);
        }

        .journey-nav-step-label {
          font-size: 0.65rem;
          line-height: 1;
          text-align: center;
          color: var(--text-muted-primary);
        }
      `}</style>
    </nav>
  );
}
