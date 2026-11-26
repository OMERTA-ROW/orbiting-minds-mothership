import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

// Unmodified CyberLink Social live background (copied from its source); browser-only WebGL.
const SpaceBackground = lazy(() => import("@/components/space/SpaceBackground"));

/** Shared decorative background for Evolution interior routes. No events, data or state. */
export default function EvolutionInteriorBackground() {
  return (
    <div className="evolution-interior-space" aria-hidden="true">
      <ClientOnly fallback={null}>
        <Suspense fallback={null}>
          <SpaceBackground />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
