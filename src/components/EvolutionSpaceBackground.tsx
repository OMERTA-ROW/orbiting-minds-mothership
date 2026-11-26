import space from "@/assets/evolution-space-depth.jpg.asset.json";

/** Decorative only: no event handlers, state, or access to workspace data. */
export default function EvolutionSpaceBackground() {
  return (
    <div className="evolution-space" aria-hidden="true">
      <img src={space.url} alt="" className="evolution-space-depth" fetchPriority="high" />
      <svg className="evolution-space-stars" width="100%" height="100%">
        <defs>
          <pattern
            id="evolution-distant-stars"
            width="521"
            height="433"
            patternUnits="userSpaceOnUse"
          >
            {Array.from({ length: 65 }, (_, i) => (
              <circle
                key={i}
                cx={(i * 137 + 31) % 521}
                cy={(i * 193 + 17) % 433}
                r={i % 9 === 0 ? 0.85 : 0.45}
                opacity={0.18 + (i % 5) * 0.1}
              />
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#evolution-distant-stars)" />
      </svg>
      <div className="evolution-space-shade" />
    </div>
  );
}
