// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
/** Shared GLSL noise helpers (3D simplex-style value noise + fbm). */
export const NOISE_GLSL = /* glsl */ `
  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(mix(dot(hash33(i + vec3(0,0,0)), f - vec3(0,0,0)),
              dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
          mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)),
              dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
      mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)),
              dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
          mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)),
              dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y),
      u.z);
    return n * 0.5 + 0.5;
  }

  float fbm3(vec3 p, int octaves) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      v += amp * noise3(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return v;
  }

  float ridge3(vec3 p, int octaves) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      v += amp * (1.0 - abs(noise3(p) * 2.0 - 1.0));
      p *= 2.11;
      amp *= 0.5;
    }
    return v;
  }
`;
