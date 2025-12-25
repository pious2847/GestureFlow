
import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { PARTICLE_COUNT, THEME, PHYSICS, PARTICLE_VISUALS, DRAWING_CONFIG } from '../constants';
import { AppMode, HandData, DrawingStyle, SceneConfig, HandGesture } from '../types';

interface SceneProps {
  handsRef: React.MutableRefObject<HandData[]>;
  mode: AppMode;
  audioData: number;
  showSkeleton: boolean;
  drawStyle: DrawingStyle;
  aiConfig: SceneConfig | null;
}

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]
];

const HandSkeleton: React.FC<{ handsRef: React.MutableRefObject<HandData[]>, visible: boolean }> = ({ handsRef, visible }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.clear();
    if (!visible) return;

    const hands = handsRef.current;
    let isCompressing = false;
    if (hands.length === 2) {
      const h1 = new THREE.Vector3(hands[0].palm.x * 10, hands[0].palm.y * 8, hands[0].palm.z * 10);
      const h2 = new THREE.Vector3(hands[1].palm.x * 10, hands[1].palm.y * 8, hands[1].palm.z * 10);
      if (h1.distanceTo(h2) < PHYSICS.compressionThreshold) isCompressing = true;
    }

    hands.forEach((hand) => {
      const { landmarks } = hand;
      if (!landmarks) return;
      const transform = (lm: { x: number, y: number, z: number }) => new THREE.Vector3(((1 - lm.x) * 2 - 1) * 10, -(lm.y * 2 - 1) * 8, lm.z * -50);
      const color = isCompressing ? 0xffffff : (hand.isRight ? 0x00f2ff : 0x7000ff);

      CONNECTIONS.forEach(([a, b]) => {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([transform(landmarks[a]), transform(landmarks[b])]),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: isCompressing ? 0.9 : 0.4 })
        );
        groupRef.current?.add(line);
      });
      landmarks.forEach(lm => {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(isCompressing ? 0.08 : 0.04, 4, 4), new THREE.MeshBasicMaterial({ color }));
        sphere.position.copy(transform(lm));
        groupRef.current?.add(sphere);
      });
    });
  });
  return <group ref={groupRef} />;
};

const Particles: React.FC<SceneProps> = ({ handsRef, mode, audioData, aiConfig, drawStyle }) => {
  const meshRef = useRef<THREE.Points>(null);
  const smoothedLandmarks = useRef<THREE.Vector3[]>(Array(42).fill(0).map(() => new THREE.Vector3()));
  const drawIndex = useRef(0);
  const drawPoolSize = 8000; // Use a dedicated pool for drawing persistence

  const [positions, initialPositions, velocities, colors, sizes, drawTimers] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const init = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const siz = new Float32Array(PARTICLE_COUNT);
    const timers = new Float32Array(PARTICLE_COUNT); // Lifetime for drawn particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 40, y = (Math.random() - 0.5) * 40, z = (Math.random() - 0.5) * 40;
      pos.set([x, y, z], i * 3); init.set([x, y, z], i * 3);
      siz[i] = Math.random() * 0.005 + 0.002;
    }
    return [pos, init, vel, col, siz, timers];
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const hands = handsRef.current;
    const posAttr = meshRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = meshRef.current.geometry.attributes.color as THREE.BufferAttribute;
    const sizeAttr = meshRef.current.geometry.attributes.size as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    const sizeArr = sizeAttr.array as Float32Array;
    const time = state.clock.elapsedTime;
    const config = DRAWING_CONFIG[drawStyle];

    // Smoothing Landmarks for Silhouette mode
    hands.forEach((hand, hIdx) => {
      hand.landmarks.forEach((lm, lIdx) => {
        const target = new THREE.Vector3(((1 - lm.x) * 2 - 1) * 10, -(lm.y * 2 - 1) * 8, lm.z * -50);
        smoothedLandmarks.current[hIdx * 21 + lIdx].lerp(target, PHYSICS.silhouetteSmoothing);
      });
    });

    // Compression / Rasengan check
    let midpoint = new THREE.Vector3(), isCompressing = false;
    if (hands.length === 2) {
      const h1 = new THREE.Vector3(hands[0].palm.x * 10, hands[0].palm.y * 8, hands[0].palm.z * 10);
      const h2 = new THREE.Vector3(hands[1].palm.x * 10, hands[1].palm.y * 8, hands[1].palm.z * 10);
      midpoint.addVectors(h1, h2).multiplyScalar(0.5);
      if (h1.distanceTo(h2) < PHYSICS.compressionThreshold) isCompressing = true;
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let x = posArr[i3], y = posArr[i3 + 1], z = posArr[i3 + 2];
      let vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];

      // Drawing Logic (subset of particles)
      if (mode === AppMode.AIR_DRAWING && i < drawPoolSize) {
        if (drawTimers[i] > 0) {
          drawTimers[i] *= config.decay;
          x += (Math.random() - 0.5) * config.jitter;
          y += (Math.random() - 0.5) * config.jitter;
          z += (Math.random() - 0.5) * config.jitter;
        } else {
          // If inactive, move off-screen or hide
          z = -100;
        }

        // Add new points if hand is "pinching" or "pointing"
        hands.forEach(h => {
          if (h.isPinching || h.gesture === HandGesture.POINTER) {
            const nextIdx = (drawIndex.current + 1) % drawPoolSize;
            const targetX = h.gesture === HandGesture.POINTER ? ((1 - h.landmarks[8].x) * 2 - 1) * 10 : h.palm.x * 10;
            const targetY = h.gesture === HandGesture.POINTER ? -(h.landmarks[8].y * 2 - 1) * 8 : h.palm.y * 8;
            const targetZ = h.gesture === HandGesture.POINTER ? h.landmarks[8].z * -50 : h.palm.z * 10;
            
            if (i === nextIdx) {
              x = targetX; y = targetY; z = targetZ;
              vx = vy = vz = 0;
              drawTimers[i] = 1.0;
              drawIndex.current = nextIdx;
            }
          }
        });
      } else {
        // Normal Physics for non-drawing particles
        if (isCompressing) {
          const dx = midpoint.x - x, dy = midpoint.y - y, dz = midpoint.z - z;
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
          if (d < 8) {
            const f = (8 - d) * PHYSICS.compressionForce;
            vx += (dx / d) * f + Math.sin(time * 10 + y) * PHYSICS.vortexSpin;
            vy += (dy / d) * f;
            vz += (dz / d) * f + Math.cos(time * 10 + x) * PHYSICS.vortexSpin;
            vx *= 0.85; vy *= 0.85; vz *= 0.85;
          }
        } else if (mode === AppMode.SILHOUETTE && hands.length > 0) {
          const lmIdx = i % (hands.length * 21);
          const target = smoothedLandmarks.current[lmIdx];
          vx += (target.x - x) * 0.015; vy += (target.y - y) * 0.015; vz += (target.z - z) * 0.015;
          vx *= 0.92; vy *= 0.92; vz *= 0.92;
        } else {
          // Interaction with hands
          for (const h of hands) {
            const dx = h.palm.x * 10 - x, dy = h.palm.y * 8 - y, dz = h.palm.z * 10 - z;
            const d2 = dx*dx + dy*dy + dz*dz;
            if (h.isOpen && d2 < 64) {
              const d = Math.sqrt(d2);
              vx += (dx / d) * PHYSICS.attractForce; vy += (dy / d) * PHYSICS.attractForce; vz += (dz / d) * PHYSICS.attractForce;
            }
          }
          // Return home
          const hX = aiConfig?.shapeVertices ? aiConfig.shapeVertices[i % aiConfig.shapeVertices.length].x : initialPositions[i3];
          const hY = aiConfig?.shapeVertices ? aiConfig.shapeVertices[i % aiConfig.shapeVertices.length].y : initialPositions[i3+1];
          const hZ = aiConfig?.shapeVertices ? aiConfig.shapeVertices[i % aiConfig.shapeVertices.length].z : initialPositions[i3+2];
          vx += (hX - x) * PHYSICS.returnHomeForce; vy += (hY - y) * PHYSICS.returnHomeForce; vz += (hZ - z) * PHYSICS.returnHomeForce;
          vx *= PHYSICS.friction; vy *= PHYSICS.friction; vz *= PHYSICS.friction;
        }
      }

      const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
      if (speed > PHYSICS.maxSpeed) { const s = PHYSICS.maxSpeed / speed; vx *= s; vy *= s; vz *= s; }
      x += vx; y += vy; z += vz;

      posArr[i3] = x; posArr[i3+1] = y; posArr[i3+2] = z;
      velocities[i3] = vx; velocities[i3+1] = vy; velocities[i3+2] = vz;

      // Color/Visual Logic
      const targetCol = new THREE.Color();
      if (mode === AppMode.AIR_DRAWING && i < drawPoolSize) {
        targetCol.set(config.color).lerp(new THREE.Color(0xffffff), Math.sin(time * 5 + i) * 0.2);
        sizeArr[i] = config.size * drawTimers[i];
      } else if (isCompressing) {
        targetCol.lerpColors(new THREE.Color(0xffffff), new THREE.Color(hands[0].isRight ? 0x00f2ff : 0x7000ff), Math.sin(time*10));
        sizeArr[i] = sizes[i] * 3.0;
      } else {
        targetCol.setHSL(PARTICLE_VISUALS.hueRange.min + (speed * 0.5), 0.9, 0.5);
        if (aiConfig) targetCol.lerp(new THREE.Color(aiConfig.primary), 0.5);
        sizeArr[i] = sizes[i] * (1.0 + audioData);
      }
      colArr[i3] = THREE.MathUtils.lerp(colArr[i3], targetCol.r, 0.1);
      colArr[i3+1] = THREE.MathUtils.lerp(colArr[i3+1], targetCol.g, 0.1);
      colArr[i3+2] = THREE.MathUtils.lerp(colArr[i3+2], targetCol.b, 0.1);
    }
    posAttr.needsUpdate = true; colAttr.needsUpdate = true; sizeAttr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={colors} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={PARTICLE_COUNT} array={sizes} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending}
        vertexShader={`attribute float size; attribute vec3 color; varying vec3 vColor; void main() { vColor = color; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (450.0 / -mvPosition.z); gl_Position = projectionMatrix * mvPosition; }`}
        fragmentShader={`varying vec3 vColor; void main() { float d = distance(gl_PointCoord, vec2(0.5)); if (d > 0.5) discard; gl_FragColor = vec4(vColor, (1.0 - d * 2.0) * ${PARTICLE_VISUALS.opacity}); }`}
      />
    </points>
  );
};

const Nebula: React.FC<{ audioData: number, colorA: string, colorB: string }> = ({ audioData, colorA, colorB }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uAudio: { value: 0 },
    uColorA: { value: new THREE.Color(colorA) }, uColorB: { value: new THREE.Color(colorB) }
  }), []);
  useFrame(s => { 
    if (materialRef.current) { 
      materialRef.current.uniforms.uTime.value = s.clock.elapsedTime; 
      materialRef.current.uniforms.uAudio.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uAudio.value, audioData, 0.05);
    } 
  });
  useEffect(() => { uniforms.uColorA.value.set(colorA); uniforms.uColorB.value.set(colorB); }, [colorA, colorB, uniforms]);
  return (
    <mesh position={[0, 0, -20]} scale={[120, 120, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial ref={materialRef} transparent depthWrite={false} uniforms={uniforms}
        vertexShader={`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform float uTime; uniform float uAudio; uniform vec3 uColorA; uniform vec3 uColorB; varying vec2 vUv;
          float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main() {
            vec2 uv = vUv - 0.5; float d = length(uv);
            float n = noise(vUv * 10.0 + uTime * 0.1);
            float n2 = noise(vUv * 50.0 - uTime * 0.2);
            vec3 c = mix(uColorA, uColorB, sin(d * 5.0 - uTime * 0.5) * 0.5 + 0.5);
            float alpha = smoothstep(1.0, 0.0, d) * (0.05 + uAudio * 0.1 + (n * 0.01) + (n2 * 0.005));
            gl_FragColor = vec4(c, alpha);
          }`}
      />
    </mesh>
  );
};

const Experience: React.FC<SceneProps> = (props) => {
  const { primary, secondary } = props.aiConfig || THEME;
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 18], fov: 55 }} gl={{ antialias: false, alpha: false }}>
        <color attach="background" args={['#010101']} />
        <Nebula audioData={props.audioData} colorA={primary} colorB={secondary} />
        <Particles {...props} />
        <HandSkeleton handsRef={props.handsRef} visible={props.showSkeleton} />
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.9} intensity={0.5 + props.audioData} radius={0.7} mipmapBlur />
          <ChromaticAberration offset={new THREE.Vector2(0.0005, 0.0005)} />
          <Noise opacity={0.02} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default Experience;
