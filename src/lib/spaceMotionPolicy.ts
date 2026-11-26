// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/** Live motion policy shared by the global background and its fallback. */
export const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const getSpaceMotionSnapshot = (): boolean =>
  typeof document !== "undefined" &&
  document.visibilityState === "visible" &&
  typeof window !== "undefined" &&
  !window.matchMedia(MOTION_QUERY).matches;

export const getServerSpaceMotionSnapshot = (): boolean => false;

export const subscribeSpaceMotion = (onChange: () => void): (() => void) => {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const media = window.matchMedia(MOTION_QUERY);
  document.addEventListener("visibilitychange", onChange);
  media.addEventListener("change", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    media.removeEventListener("change", onChange);
  };
};
