// @ts-nocheck -- copied verbatim from CyberLink Social; its looser compiler settings differ from this project.
import * as THREE from "three";
import { SKY_RADIUS } from "../worldScale";

/**
 * Direction-only procedural deep-space haze. It is an inward-facing opaque
 * shell in the earliest render queue, so planets and transparent physical
 * objects always render over it without photographic panels or seams.
 */

const vert = /* glsl */ `
  varying vec3 vDir;
  void main(){ vDir=normalize(position); gl_Position=projectionMatrix*vec4(mat3(viewMatrix)*mat3(modelMatrix)*position,1.0); gl_Position.z=gl_Position.w*0.99999; }
`;
const frag = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  float hash(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
  float noise(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  void main(){ vec3 d=normalize(vDir); float broad=noise(d*3.2+11.0); float dust=noise(d*15.0-4.0); float voids=smoothstep(.44,.72,noise(d*5.3+31.0)); float h=max(0.0,broad-.47)*(1.0-voids*.82)+max(0.0,dust-.72)*.12; vec3 navy=vec3(.006,.012,.028); vec3 haze=vec3(.025,.055,.095)*h*.28; gl_FragColor=vec4(navy+haze,1.0); }
`;

const DeepSky = ({ full }: { full: boolean }) => (
  <mesh frustumCulled={false} renderOrder={-1000}>
    <sphereGeometry args={[SKY_RADIUS * 0.985, full ? 48 : 32, full ? 32 : 20]} />
    <shaderMaterial
      vertexShader={vert}
      fragmentShader={frag}
      side={THREE.BackSide}
      depthWrite={false}
      depthTest={false}
      toneMapped={false}
    />
  </mesh>
);

export default DeepSky;
