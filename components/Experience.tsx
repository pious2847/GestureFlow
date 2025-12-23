
import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { PARTICLE_COUNT, THEME, PHYSICS, PARTICLE_VISUALS } from '../constants';
import { AppMode, HandData, DrawingStyle, SceneConfig, HandGesture } from '../types';

interface SceneProps {
  handsRef: React.MutableRefObject<HandData[]>;
  mode: AppMode;
  audioData: number;
  showSkeleton: boolean;
  drawStyle: DrawingStyle;
  aiConfig: SceneConfig | null;
}

const Nebula: React.FC<{ audioData: number; colorA: string; colorB: string }> = ({ audioData, colorA, colorB }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAudio: { value: 0 },
    uColorA: { value: new THREE.Color(colorA) },
    uColorB: { value: new THREE.Color(colorB) }
  }), []);

  useEffect(() => {
    gsap.to(uniforms.uColorA.value, { r: new THREE.Color(colorA).r, g: new THREE.Color(colorA).g, b: new THREE.Color(colorA).b, duration: 2 });
    gsap.to(uniforms.uColorB.value, { r: new THREE.Color(colorB).r, g: new THREE.Color(colorB).g, b: new THREE.Color(colorB).b, duration: 2 });
  }, [colorA, colorB]);

  useFrame((state) => {
    if (meshRef.current) {
      uniforms.uTime.value = state.clock.getElapsedTime();
      uniforms.uAudio.value = THREE.MathUtils.lerp(uniforms.uAudio.value, audioData, 0.1);
      meshRef.current.rotation.y += 0.0005;
    }
  });

  return (
    <mesh ref={meshRef} scale={[60, 60, 60]}>
      <sphereGeometry args={[1, 32, 32]} />
      <shaderMaterial
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vPosition;
          void main() {
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform float uAudio;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          varying vec3 vPosition;
          float noise(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          }
          void main() {
            float n = noise(vPosition * 0.5 + uTime * 0.02);
            float alpha = smoothstep(0.9, 1.1, n + uAudio * 0.2);
            vec3 finalColor = mix(uColorA, uColorB, n);
            gl_FragColor = vec4(finalColor, alpha * 0.04);
          }
        `}
      />
    </mesh>
  );
};

const Particles: React.FC<SceneProps> = ({ handsRef, mode, audioData, showSkeleton, aiConfig }) => {
  const meshRef = useRef<THREE.Points>(null);
  const transitionRef = useRef({ intensity: 1.0 });

  const activeFriction = useRef(PHYSICS.friction);
  const activeAttract = useRef(PHYSICS.attractForce);
  const timeScale = useRef(1.0);
  const chaosFactor = useRef(0.0);
  const alignmentFactor = useRef(0.0);

  useEffect(() => {
    if (aiConfig) {
      gsap.to(activeFriction, { current: aiConfig.friction, duration: 2 });
      gsap.to(activeAttract, { current: aiConfig.attractForce, duration: 2 });
    }
  }, [aiConfig]);

  const [positions, initialPositions, velocities, colors, sizes] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const init = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const siz = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 12;
      const y = (Math.random() - 0.5) * 12;
      const z = (Math.random() - 0.5) * 12;
      pos.set([x, y, z], i * 3);
      init.set([x, y, z], i * 3);
      vel.set([0, 0, 0], i * 3);
      col.set([0, 0.95, 1], i * 3); 
      siz[i] = Math.random() * PARTICLE_VISUALS.sizeVariation + PARTICLE_VISUALS.baseSize;
    }
    return [pos, init, vel, col, siz];
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

    let activeGesture = HandGesture.NONE;
    if (hands.length > 0) activeGesture = hands[0].gesture;

    const targetTimeScale = activeGesture === HandGesture.PEACE ? 0.08 : 1.0;
    const targetChaos = activeGesture === HandGesture.ROCK ? 1.0 : 0.0;
    const targetAlignment = activeGesture === HandGesture.THUMBS_UP ? 1.0 : 0.0;

    timeScale.current = THREE.MathUtils.lerp(timeScale.current, targetTimeScale, 0.05);
    chaosFactor.current = THREE.MathUtils.lerp(chaosFactor.current, targetChaos, 0.05);
    alignmentFactor.current = THREE.MathUtils.lerp(alignmentFactor.current, targetAlignment, 0.05);

    const attractFalloffSq = PHYSICS.attractFalloff * PHYSICS.attractFalloff;
    const repelFalloffSq = PHYSICS.repelFalloff * PHYSICS.repelFalloff;

    const shapeVertices = aiConfig?.shapeVertices;
    const hasShape = shapeVertices && shapeVertices.length > 0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let x = posArr[i3], y = posArr[i3 + 1], z = posArr[i3 + 2];
      let vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];

      for (const h of hands) {
        const hx = h.palm.x * 5, hy = h.palm.y * 3, hz = h.palm.z * 5;
        const dx = hx - x, dy = hy - y, dz = hz - z;
        const d2 = dx * dx + dy * dy + dz * dz;

        if ((h.isOpen || h.gesture === HandGesture.POINTER) && d2 < attractFalloffSq) {
          const dist = Math.sqrt(d2);
          const force = (PHYSICS.attractFalloff - dist) * activeAttract.current * (h.gesture === HandGesture.POINTER ? 4.0 : 1.0);
          vx += (dx / dist) * force; vy += (dy / dist) * force; vz += (dz / dist) * force;
        } else if (!h.isPinching && d2 < repelFalloffSq) {
          const dist = Math.sqrt(d2);
          const force = (PHYSICS.repelFalloff - dist) * (aiConfig?.repelForce || PHYSICS.repelForce);
          vx -= (dx / dist) * force; vy -= (dy / dist) * force; vz -= (dz / dist) * force;
        }
      }

      // Home/Shape Attraction
      if (mode === AppMode.PLAYGROUND || mode === AppMode.AI_ORACLE) {
        if (hasShape) {
          // Attract to specific vertex
          const v = shapeVertices[i % shapeVertices.length];
          vx += (v.x - x) * 0.015;
          vy += (v.y - y) * 0.015;
          vz += (v.z - z) * 0.015;
        } else {
          vx += (initialPositions[i3] - x) * PHYSICS.returnHomeForce;
          vy += (initialPositions[i3+1] - y) * PHYSICS.returnHomeForce;
          vz += (initialPositions[i3+2] - z) * PHYSICS.returnHomeForce;
        }
      }

      if (chaosFactor.current > 0.1) {
        vx += (Math.random() - 0.5) * chaosFactor.current * 0.4;
        vy += (Math.random() - 0.5) * chaosFactor.current * 0.4;
        vz += (Math.random() - 0.5) * chaosFactor.current * 0.4;
      }

      vx *= activeFriction.current; vy *= activeFriction.current; vz *= activeFriction.current;
      x += vx * timeScale.current; y += vy * timeScale.current; z += vz * timeScale.current;

      if (alignmentFactor.current > 0.1) {
        const gridSize = 1.2;
        const targetX = Math.round(x / gridSize) * gridSize;
        const targetY = Math.round(y / gridSize) * gridSize;
        const targetZ = Math.round(z / gridSize) * gridSize;
        x = THREE.MathUtils.lerp(x, targetX, alignmentFactor.current * 0.15);
        y = THREE.MathUtils.lerp(y, targetY, alignmentFactor.current * 0.15);
        z = THREE.MathUtils.lerp(z, targetZ, alignmentFactor.current * 0.15);
      }

      const limit = PHYSICS.boundaryLimit;
      if (Math.abs(x) > limit) { x = Math.sign(x) * limit; vx *= -0.5; }
      if (Math.abs(y) > limit) { y = Math.sign(y) * limit; vy *= -0.5; }
      if (Math.abs(z) > limit) { z = Math.sign(z) * limit; vz *= -0.5; }

      posArr[i3] = x; posArr[i3+1] = y; posArr[i3+2] = z;
      velocities[i3] = vx; velocities[i3+1] = vy; velocities[i3+2] = vz;

      const currentSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);
      const hueShift = Math.min(currentSpeed * 2, 1);
      const hVal = PARTICLE_VISUALS.hueRange.min + ((PARTICLE_VISUALS.hueRange.max - PARTICLE_VISUALS.hueRange.min) * hueShift);
      const targetCol = new THREE.Color().setHSL(hVal, 0.8, 0.5);
      if (aiConfig) targetCol.lerp(new THREE.Color(aiConfig.primary), 0.5);
      
      colArr[i3] = THREE.MathUtils.lerp(colArr[i3], targetCol.r, 0.1);
      colArr[i3+1] = THREE.MathUtils.lerp(colArr[i3+1], targetCol.g, 0.1);
      colArr[i3+2] = THREE.MathUtils.lerp(colArr[i3+2], targetCol.b, 0.1);
      sizeArr[i] = THREE.MathUtils.lerp(sizeArr[i], (aiConfig?.particleSize || PARTICLE_VISUALS.baseSize) + audioData * 0.1, 0.1);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={colors} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={PARTICLE_COUNT} array={sizes} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          varying vec3 vColor;
          void main() {
            float d = distance(gl_PointCoord, vec2(0.5));
            if (d > 0.5) discard;
            float strength = 1.0 - (d * 2.0);
            gl_FragColor = vec4(vColor, strength);
          }
        `}
      />
    </points>
  );
};

const Experience: React.FC<SceneProps> = (props) => {
  const pColor = props.aiConfig?.primary || THEME.primary;
  const sColor = props.aiConfig?.secondary || THEME.secondary;
  return (
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 8], fov: 75 }} gl={{ antialias: false }}>
        <color attach="background" args={['#010101']} />
        <ambientLight intensity={0.5} />
        <Nebula audioData={props.audioData} colorA={pColor} colorB={sColor} />
        <Particles {...props} />
        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.85} intensity={1.0 + props.audioData * 1.5} radius={0.4} />
          <ChromaticAberration offset={new THREE.Vector2(0.001 * props.audioData, 0.001 * props.audioData)} />
          <Noise opacity={0.03} />
          <Vignette darkness={1.2} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default Experience;
