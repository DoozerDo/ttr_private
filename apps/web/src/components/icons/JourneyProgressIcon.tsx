import { useId } from "react";

type JourneyProgressIconProps = {
  stage: 1 | 2 | 3 | 4;
  className?: string;
  active?: boolean;
};

const ARROW_TRANSLATE_X: Record<JourneyProgressIconProps["stage"], number> = {
  1: -4,
  2: -2.5,
  3: -1.2,
  4: 0,
};

function layerState(stage: JourneyProgressIconProps["stage"]) {
  return {
    ringOuter: stage >= 2,
    ringInner: stage >= 3,
    bullseye: stage >= 4,
  };
}

export function JourneyProgressIcon({
  stage,
  className,
  active = false,
}: JourneyProgressIconProps) {
  const iconId = useId().replace(/:/g, "");
  const layers = layerState(stage);

  return (
    <>
      <svg
        viewBox="0 0 24 24"
        role="presentation"
        className={["journey-progress-icon h-5 w-5", active ? "journey-progress-icon-active" : "", className ?? ""]
          .filter(Boolean)
          .join(" ")}
        data-active={active ? "true" : undefined}
        data-stage={stage}
        aria-hidden
      >
        <g
          id={`${iconId}-ring-outer`}
          className={[
            "journey-progress-icon-layer journey-progress-icon-layer-ring-outer",
            layers.ringOuter ? "journey-progress-icon-layer-visible" : "journey-progress-icon-layer-hidden",
            stage === 1 ? "journey-progress-icon-layer-next" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid="journey-progress-ring-outer"
          aria-hidden={!layers.ringOuter}
        >
          <circle
            cx="12"
            cy="12"
            r="7.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        <g
          id={`${iconId}-ring-inner`}
          className={[
            "journey-progress-icon-layer journey-progress-icon-layer-ring-inner",
            layers.ringInner ? "journey-progress-icon-layer-visible" : "journey-progress-icon-layer-hidden",
            stage === 2 ? "journey-progress-icon-layer-next" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid="journey-progress-ring-inner"
          aria-hidden={!layers.ringInner}
        >
          <circle
            cx="12"
            cy="12"
            r="4.15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        <g
          id={`${iconId}-bullseye`}
          className={[
            "journey-progress-icon-layer journey-progress-icon-layer-bullseye",
            layers.bullseye ? "journey-progress-icon-layer-visible" : "journey-progress-icon-layer-hidden",
            stage === 3 ? "journey-progress-icon-layer-next" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid="journey-progress-bullseye"
          aria-hidden={!layers.bullseye}
        >
          <circle cx="12" cy="12" r="1.9" fill="currentColor" />
        </g>

        <g
          id={`${iconId}-arrow`}
          className="journey-progress-icon-layer journey-progress-icon-arrow"
          transform={`translate(${ARROW_TRANSLATE_X[stage]} 0)`}
          data-testid="journey-progress-arrow"
          aria-hidden={false}
        >
          <path
            d="M5.25 12h8.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M13.35 9.2l3.4 2.8-3.4 2.8z" fill="currentColor" />
        </g>
      </svg>

      <style jsx>{`
        .journey-progress-icon-layer {
          transition: transform 220ms ease-out, opacity 220ms ease-out;
          transform-origin: 12px 12px;
        }
        .journey-progress-icon-layer-visible {
          opacity: 1;
          transform: scale(1);
        }
        .journey-progress-icon-layer-hidden {
          opacity: 0;
          transform: scale(0.95);
        }
        .journey-progress-icon-arrow {
          transition: transform 220ms ease-out, opacity 220ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .journey-progress-icon-layer,
          .journey-progress-icon-arrow {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
