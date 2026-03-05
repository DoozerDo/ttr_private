"use client";

import { usePathname, useRouter } from "next/navigation";
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
  if (stepId === "results") {
    return (
      <svg
        viewBox="0 0 24 24"
        role="presentation"
        strokeWidth="1.5"
        stroke="currentColor"
        fill="none"
      >
        <circle cx="12" cy="12" r="8" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M4 12a8 8 0 0 1 16 0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12l4.5-5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12h-3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }

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

  if (stepId === "studio") {
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

  const handleStepClick = (stepId: JourneyStepId) => {
    if (!onStepClick) return;
    onStepClick(stepId);
  };

  return (
    <nav
      aria-label={ariaLabel ?? "Current journey progress"}
      className="journey-nav-root relative w-full min-h-[110px]"
    >
      <div key={pathname} className="journey-nav-clip-shell">
        <div className="journey-nav-inner relative">
          <div className="journey-nav-step-grid">
            <span className="journey-nav-line" aria-hidden />
            <span
              className="journey-nav-line-progress"
              style={{
                transform: `translateY(-50%) scaleX(${progressPercent / 100})`,
              }}
              aria-hidden
            />
            {state.steps.map((step) => {
              const isActive = step.id === pathActiveStepId;
              const isCompleted = step.state === JourneyStepState.Completed;
              const isLocked = step.state === JourneyStepState.Locked;

              const route = routeLookup.get(step.id);
              const routeHref = route?.href;
              const canNavigate = Boolean(routeHref && !isLocked);

              const nodeClass = [
                "journey-nav-step-button",
                "ttr-nav-item",
                isActive ? "journey-nav-step-active" : "",
                isCompleted ? "journey-nav-step-completed" : "",
                isLocked ? "journey-nav-step-locked" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const iconAreaClass = [
                "journey-nav-icon-area",
              ]
                .filter(Boolean)
                .join(" ");

              const stepContent = (
                <>
                  <span className={iconAreaClass}>
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
                  data-active={isActive ? "true" : undefined}
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
          background-color: transparent;
          background-image: none;
          border-radius: 1.5rem;
          border: none;
          border-bottom: 1px solid var(--border-strong, #2a3342);
          padding: 0;
          box-shadow: none;
          filter: none;
          backdrop-filter: none;
          position: relative;
          isolation: isolate;
        }

        .journey-nav-clip-shell {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          border-radius: inherit;
          padding: 1rem;
          background-color: var(--surface-secondary, #111827);
          background-image: none;
          border: 1px solid var(--border-subtle, #1f2632);
          box-shadow: none;
          filter: none;
          backdrop-filter: none;
        }

        .journey-nav-inner {
          position: relative;
          background-color: transparent;
          background-image: none;
          box-shadow: none;
          filter: none;
          backdrop-filter: none;
          --journey-icon-size: 64px;
          --journey-padding: 1rem;
          --journey-line-y: calc(var(--journey-padding) + var(--journey-icon-size) / 2);
        }

        .journey-nav-step-grid {
          position: relative;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          pointer-events: none;
          z-index: 1;
        }

        .journey-nav-line,
        .journey-nav-line-progress {
          position: absolute;
          left: calc(var(--journey-icon-size) / 2);
          right: calc(var(--journey-icon-size) / 2);
          top: var(--journey-line-y);
          height: 2px;
          border-radius: 999px;
          pointer-events: none;
          z-index: 0;
        }

        .journey-nav-line {
          transform: translateY(-50%);
        }

        .journey-nav-line {
          background: linear-gradient(
            90deg,
            rgba(10, 12, 17, 0.9),
            rgba(43, 47, 57, 0.96),
            rgba(10, 12, 17, 0.85)
          );
        }

        .journey-nav-line-progress {
          transition: transform 0.18s ease-out;
          z-index: 1;
          transform-origin: left center;
          background: linear-gradient(
            90deg,
            rgba(21, 26, 33, 0.9),
            rgba(194, 77, 12, 0.9),
            rgba(14, 17, 24, 0.85)
          );
          box-shadow: none;
        }

        .journey-nav-line-progress::after {
          content: none;
        }

        .journey-nav-step-grid {
          position: relative;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          pointer-events: none;
          z-index: 1;
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
          color: inherit;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          min-width: 0;
          padding: 0;
          margin: 0;
          pointer-events: auto;
          position: relative;
          z-index: 10;
        }

        .journey-nav-step-button:focus-visible {
          outline: none;
        }

        .journey-nav-step-locked {
          color: var(--text-muted-tertiary, rgba(148, 163, 184, 0.72));
          cursor: not-allowed;
        }

        .journey-nav-step-active {
          color: var(--text-primary);
        }

        .journey-nav-step-completed {
          color: var(--text-secondary);
        }

        .journey-nav-step-button:not(.journey-nav-step-locked):hover .journey-nav-icon-area {
          box-shadow: none;
        }

        .journey-nav-icon-area {
          position: relative;
          width: 64px;
          height: 64px;
          border-radius: 999px;
          isolation: isolate;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(8, 10, 15, 0.96);
          background-image: none;
          background-blend-mode: normal;
          border: 2px solid var(--metal-edge-outer, rgba(255, 255, 255, 0.1));
          box-shadow: none;
          overflow: visible;
          --journey-nav-target-translate: 0px;
          transform: translateY(var(--journey-nav-target-translate)) scale(1);
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease,
            background 0.18s ease;
          pointer-events: none;
          z-index: 5;
        }

        .journey-nav-icon-area::before {
          content: none;
        }
        .journey-nav-icon-area::after {
          content: none;
        }

        .journey-nav-step-active .journey-nav-icon-area {
          border-color: rgba(194, 77, 12, 0.9);
          box-shadow: none;
          pointer-events: none;
        }

        .journey-nav-step-completed .journey-nav-icon-area {
          box-shadow: none;
        }

        .journey-nav-step-locked .journey-nav-icon-area {
          background: rgba(16, 18, 26, 0.9);
          border-color: rgba(148, 163, 184, 0.35);
          box-shadow: none;
        }

        .journey-nav-step-active,
        .journey-nav-step-active * {
          filter: none !important;
          box-shadow: none !important;
          text-shadow: none !important;
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
          color: var(--text-muted-primary, rgba(226, 232, 240, 0.75));
        }
      `}</style>
    </nav>
  );
}
