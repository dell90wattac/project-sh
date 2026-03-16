import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass }        from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js';
import * as THREE from 'three';

export function createPostProcessing(renderer, scene, camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  const composer = new EffectComposer(renderer);

  // ─── Base render ──────────────────────────────────────────────────────────
  composer.addPass(new RenderPass(scene, camera));

  // ─── SSAO — ambient occlusion for depth in corners/crevices ───────────────
  const ssaoPass = new SSAOPass(scene, camera, w, h);
  ssaoPass.kernelRadius = 10;
  ssaoPass.minDistance  = 0.002;
  ssaoPass.maxDistance  = 0.15;
  composer.addPass(ssaoPass);

  // ─── Bloom — soft glow on emissive lamp shades and bulbs only ─────────────
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    0.35,   // strength
    0.4,    // radius
    0.82    // threshold — only bright emissive surfaces glow
  );
  composer.addPass(bloomPass);

  // ─── Vignette — darkens screen edges for horror atmosphere ────────────────
  const vignettePass = new ShaderPass({
    uniforms: {
      tDiffuse:     { value: null },
      uVigStrength: { value: 0.55 },
      uVigSoftness: { value: 0.45 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uVigStrength;
      uniform float uVigSoftness;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        vec2 uv = vUv * 2.0 - 1.0;
        float vignette = 1.0 - smoothstep(uVigSoftness, uVigSoftness + uVigStrength, length(uv));
        color.rgb *= vignette;
        gl_FragColor = color;
      }`,
  });
  composer.addPass(vignettePass);

  return {
    render: () => composer.render(),
    resize: (nw, nh) => {
      composer.setSize(nw, nh);
      ssaoPass.setSize(nw, nh);
      bloomPass.resolution.set(nw, nh);
    },
  };
}
