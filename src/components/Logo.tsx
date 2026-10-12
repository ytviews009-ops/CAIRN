export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Cairn logo"
    >
      {/* Three stacked stones — a cairn trail marker */}
      <ellipse cx="24" cy="40" rx="18" ry="3.5" fill="#e5e5ea" />
      <path
        d="M10 36c0-3 4-5 8-5s8 2 8 5v3H10v-3z"
        fill="#8e8e93"
      />
      <path
        d="M14 28c0-3.5 5-5.5 10-5.5s10 2 10 5.5v4H14v-4z"
        fill="#636366"
      />
      <path
        d="M17 20c0-3 5-5 7-5s7 2 7 5v4H17v-4z"
        fill="#3a3a3c"
      />
      <circle cx="24" cy="16" r="1.5" fill="#fff" opacity="0.4" />
    </svg>
  );
}
