export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="AccessCore"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="30" height="30" rx="8" className="fill-brand" />
      <path
        d="M16 7.5 22.5 11v6.2c0 4-2.7 6.7-6.5 7.8-3.8-1.1-6.5-3.8-6.5-7.8V11L16 7.5Z"
        className="fill-ink"
      />
      <path
        d="m13 16 2.2 2.4L19.2 14"
        stroke="currentColor"
        className="text-permit"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
