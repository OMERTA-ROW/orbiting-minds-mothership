// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
// @refresh reset
// This module owns hook-local WebGL resources; hot updates must remount consumers
// rather than preserving an incompatible hook frame from an earlier loader version.
import { useEffect, useState } from "react";
import * as THREE from "three";

import mercury from "@/assets/space/mercury.jpg.asset.json";
import venusSurface from "@/assets/space/venus_surface.jpg.asset.json";
import venusAtmosphere from "@/assets/space/venus_atmosphere.jpg.asset.json";
import earthDay from "@/assets/space/earth_daymap.jpg.asset.json";
import earthClouds from "@/assets/space/earth_clouds.jpg.asset.json";
import mars from "@/assets/space/mars.jpg.asset.json";
import jupiter from "@/assets/space/jupiter.jpg.asset.json";
import saturn from "@/assets/space/saturn.jpg.asset.json";
import saturnRing from "@/assets/space/saturn_ring.png.asset.json";
import uranus from "@/assets/space/uranus.jpg.asset.json";
import neptune from "@/assets/space/neptune.jpg.asset.json";
import moon from "@/assets/space/moon.jpg.asset.json";
import sun from "@/assets/space/sun.jpg.asset.json";

/**
 * Sourced astronomy imagery, including public-domain mission products and the
 * CC BY 4.0 Solar System Scope texture set, served from the CDN. Everything is
 * loaded lazily after first paint so large maps do not block the interface.
 */
export const SPACE_TEXTURE_URLS = {
  Mercury: mercury.url,
  Venus: venusSurface.url,
  Earth: earthDay.url,
  Mars: mars.url,
  Jupiter: jupiter.url,
  Saturn: saturn.url,
  Uranus: uranus.url,
  Neptune: neptune.url,
} as const;

export const CLOUD_TEXTURE_URLS: Record<string, string> = {
  Earth: earthClouds.url,
  Venus: venusAtmosphere.url,
};

export const MOON_TEXTURE_URL = moon.url;
export const SUN_TEXTURE_URL = sun.url;
export const RING_TEXTURE_URL = saturnRing.url;
const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");
const cache = new Map<string, Promise<THREE.Texture>>();

/** Genuine texture download progress for loading UIs (counts unique URL requests). */
export interface TextureLoadStats { requested: number; loaded: number; failed: number }
const stats: TextureLoadStats = { requested: 0, loaded: 0, failed: 0 };
const statListeners = new Set<(s: TextureLoadStats) => void>();
const emitStats = () => statListeners.forEach((l) => l({ ...stats }));
export const getTextureLoadStats = (): TextureLoadStats => ({ ...stats });
export const subscribeTextureLoadStats = (listener: (s: TextureLoadStats) => void) => {
  statListeners.add(listener);
  return () => { statListeners.delete(listener); };
};

const load = (url: string) => {
  let p = cache.get(url);
  if (!p) {
    stats.requested++;
    emitStats();
    const request = new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(url, (t) => { stats.loaded++; emitStats(); resolve(t); }, undefined, (e) => { stats.failed++; emitStats(); reject(e); });
    });
    p = request.catch((error) => {
      // A transient CDN/network failure must not poison this URL forever.
      if (cache.get(url) === p) cache.delete(url);
      throw error;
    });
    cache.set(url, p);
  }
  return p;
};

export interface LazyTextureOptions {
  /** colour maps are sRGB, data maps (bump/alpha) are linear */
  srgb?: boolean;
  anisotropy?: number;
  /** delay in ms before the request starts, so the UI paints first */
  delay?: number;
}

/**
 * Progressive texture load. Returns `null` until the image is decoded, so the
 * caller can render an instant procedural stand-in and swap without a flash.
 */
export const useLazyTexture = (
  url: string | undefined,
  { srgb = true, anisotropy = 8, delay = 120 }: LazyTextureOptions = {},
): THREE.Texture | null => {
  // Keep this custom hook independent of renderer-context hooks. Adding a
  // nested renderer hook here changes every consumer's hook frame during HMR
  // and can blank an already-mounted preview with a hook-order exception.
  // Three's renderer applies its own hardware limit when uploading textures.
  const effectiveAnisotropy = Math.max(1, Math.min(8, anisotropy));
  const textureKey = url ? `${url}|${srgb ? "srgb" : "linear"}|${effectiveAnisotropy}` : "";
  const [loaded, setLoaded] = useState<{ key: string; texture: THREE.Texture } | null>(null);

  useEffect(() => {
    let owned: THREE.Texture | null = null;
    if (!url) {
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      load(url)
        .then((t) => {
          if (!alive) return;
          const clone = t.clone();
          clone.needsUpdate = true;
          clone.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          clone.wrapS = THREE.RepeatWrapping;
          clone.wrapT = THREE.ClampToEdgeWrapping;
          clone.anisotropy = effectiveAnisotropy;
          owned = clone;
          if (alive) setLoaded({ key: textureKey, texture: clone });
          else clone.dispose();
        })
        .catch(() => {
          /* offline / blocked: procedural surface stays */
        });
    }, delay);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      if (owned) owned.dispose();
    };
  }, [url, srgb, effectiveAnisotropy, delay, textureKey]);

  return loaded?.key === textureKey ? loaded.texture : null;
};
