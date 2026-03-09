"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent, type ReactElement } from "react";

import {
  JourneyNavState,
  JourneyStepId,
  JourneyStepState,
  resolveJourneyNavStateFromPathname,
} from "@/src/lib/journeyNav";
import { JourneyProgressIcon } from "@/src/components/icons/JourneyProgressIcon";
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

const renderStepIcon = (stepId: JourneyStepId, isActive: boolean): ReactElement | null => {
  if (stepId === "results") {
    return (
      <JourneyProgressIcon stage={2} active={isActive} className="h-full w-full" />
    );
  }

  if (stepId === "baselines") {
    return (
      <JourneyProgressIcon stage={1} active={isActive} className="h-full w-full" />
    );
  }

  if (stepId === "studio") {
    return (
      <JourneyProgressIcon stage={3} active={isActive} className="h-full w-full" />
    );
  }

  if (stepId === "jobTracker") {
    return (
      <JourneyProgressIcon stage={4} active={isActive} className="h-full w-full" />
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
                      {renderStepIcon(step.id, isActive)}
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
          border-radius: 1rem;
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
          padding: 0.9rem 1rem 0.85rem;
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
          --journey-icon-size: 52px;
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
            rgba(46, 56, 72, 0.75),
            rgba(63, 75, 96, 0.9),
            rgba(46, 56, 72, 0.75)
          );
        }

        .journey-nav-line-progress {
          transition: transform 0.18s ease-out;
          z-index: 1;
          transform-origin: left center;
          background: linear-gradient(
            90deg,
            rgba(71, 85, 105, 0.9),
            rgba(100, 116, 139, 0.95),
            rgba(71, 85, 105, 0.9)
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
          gap: 0.45rem;
          color: inherit;
          font-size: 0.76rem;
          letter-spacing: 0.02em;
          text-transform: none;
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
          width: 52px;
          height: 52px;
          border-radius: 14px;
          isolation: isolate;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(10, 14, 24, 0.96);
          background-image: none;
          background-blend-mode: normal;
          border: 1px solid rgba(148, 163, 184, 0.25);
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
          border-color: rgba(203, 213, 225, 0.6);
          background-color: rgba(15, 23, 42, 0.94);
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
          font-size: 0.7rem;
          font-weight: 600;
          line-height: 1;
          text-align: center;
          color: var(--text-muted-primary, rgba(226, 232, 240, 0.75));
        }
      `}</style>
    </nav>
  );
}
