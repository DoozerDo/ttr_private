type JourneyProgressIconProps = {
  stage: 1 | 2 | 3 | 4;
  className?: string;
  active?: boolean;
};

export function JourneyProgressIcon({ stage, className, active = false }: JourneyProgressIconProps) {
  const stroke = active ? "currentColor" : "currentColor";
  const commonProps = {
    stroke,
    strokeWidth: 1.8,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden
      className={["h-5 w-5", className ?? ""].filter(Boolean).join(" ")}
    >
      {stage === 1 ? (
        <>
          <circle cx="12" cy="12" r="7.5" {...commonProps} />
          <circle cx="12" cy="12" r="3" {...commonProps} />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </>
      ) : null}

      {stage === 2 ? (
        <>
          <path d="M4.5 17.5h15" {...commonProps} />
          <path d="M7 16V9.5" {...commonProps} />
          <path d="M12 16V7" {...commonProps} />
          <path d="M17 16V11.5" {...commonProps} />
        </>
      ) : null}

      {stage === 3 ? (
        <>
          <path d="M7 4.75h7l3 3V19.25H7z" {...commonProps} />
          <path d="M14 4.75v3h3" {...commonProps} />
          <path d="M9.25 12h5.5" {...commonProps} />
          <path d="M9.25 15h5.5" {...commonProps} />
        </>
      ) : null}

      {stage === 4 ? (
        <>
          <rect x="4.75" y="8.5" width="14.5" height="9.75" rx="1.5" {...commonProps} />
          <path d="M8.25 8.5V7.25A3.75 3.75 0 0 1 12 3.5a3.75 3.75 0 0 1 3.75 3.75V8.5" {...commonProps} />
          <path d="M10.5 13.25h3" {...commonProps} />
        </>
      ) : null}
    </svg>
  );
}
