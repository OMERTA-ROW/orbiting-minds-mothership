// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import { Suspense, lazy, useMemo, useSyncExternalStore } from "react";
import { isLowPowerDevice, resolveQuality, useSpaceBgSettings } from "@/lib/spaceBackgroundSettings";
import { getSpaceMotionSnapshot, getServerSpaceMotionSnapshot, subscribeSpaceMotion } from "@/lib/spaceMotionPolicy";
import ProceduralStarFallback from "./voyage/ProceduralStarFallback";

const SpaceScene = lazy(() => import("./scene/SpaceScene"));

/**
 * Fixed, full-screen astronomical background. Sits behind every route and
 * combines sourced imagery with spatial geometry without receiving pointer events.
 */
const SpaceBackground = () => {
  const { mode, dim, view, camera, quality } = useSpaceBgSettings();
  const lowPower = useMemo(isLowPowerDevice, []);
  const tier = useMemo(() => resolveQuality(quality), [quality]);

  const render3d = mode !== "off";
  const full = mode === "full" && !lowPower;
  const animate = useSyncExternalStore(subscribeSpaceMotion, getSpaceMotionSnapshot, getServerSpaceMotionSnapshot);
  const webgl = useMemo(() => {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      return false;
    }
  }, []);

  return (
    <div aria-hidden className="fixed inset-0 -z-10 pointer-events-none select-none overflow-hidden bg-black">
      {/* Pure black base — every layer above dissolves into it. */}
      <div className="absolute inset-0 bg-black" />

      {render3d && webgl ? (
        <Suspense fallback={null}>
          <SpaceScene full={full} animate={animate} view={view} cameraMode={camera} tier={tier} />
        </Suspense>
      ) : render3d ? <ProceduralStarFallback calm={!animate} /> : null}

      {/* Dim veil + vignette keep text and feed content fully legible on top. */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-500"
        style={{ opacity: Math.min(1, Math.max(0, dim)) }}
      />
      <div className="absolute inset-0 [background:radial-gradient(ellipse_at_50%_45%,transparent_32%,rgba(0,0,0,0.55)_80%,#000_100%)]" />
    </div>
  );
};

export default SpaceBackground;
