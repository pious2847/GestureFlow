
import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { PARTICLE_COUNT, MAX_DRAW_POINTS, THEME, PHYSICS, DRAWING_CONFIG, PARTICLE_VISUALS } from '../constants';
import { AppMode, HandData, DrawingStyle, SceneConfig } from '../types';

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
    gsap.to(uniforms.uColorA.value, { 
      r: new THREE.Color(colorA).r, 
      g: new THREE.Color(colorA).g, 
      b: new THREE.Color(colorA).b, 
      duration: 2 
    });
    gsap.to(uniforms.uColorB.value, { 
      r: new THREE.Color(colorB).r, 
      g: new THREE.Color(colorB).g, 
      b: new THREE.Color(colorB).b, 
      duration: 2 
    });
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

const Grid: React.FC<{ audioData: number; color: string }> = ({ audioData, color }) => {
  const gridRef = useRef<THREE.Group>(null);
  return (
    <group ref={gridRef} rotation={[Math.PI / 2, 0, 0]}>
      <gridHelper args={[100, 50, '#111', '#050505']} position={[0, -8, 0]}>
        <meshBasicMaterial transparent opacity={0.03} color={color} />
      </gridHelper>
      <gridHelper args={[100, 50, '#111', '#050505']} position={[0, 8, 0]}>
        <meshBasicMaterial transparent opacity={0.03} color={color} />
      </gridHelper>
    </group>
  );
};

const Background: React.FC<{ audioData: number }> = ({ audioData }) => {
  const starsRef = useRef<THREE.Points>(null);
  const count = 1000; 
  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 35 + Math.random() * 15;
      pos.set([r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)], i * 3);
      s[i] = Math.random() * 0.5;
    }
    return [pos, s];
  }, []);

  useFrame((state) => {
    if (starsRef.current) {
      starsRef.current.rotation.y += 0.0001;
      const starAttr = starsRef.current.geometry.attributes.size as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        const pulse = 0.5 + Math.sin(state.clock.getElapsedTime() * 2 + i) * 0.5;
        starAttr.setX(i, sizes[i] * (0.8 + pulse * 0.2 + audioData * 0.5));
      }
      starAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={starsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{ uColor: { value: new THREE.Color(THEME.star) } }}
        vertexShader={`
          attribute float size;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (150.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            gl_FragColor = vec4(uColor, smoothstep(0.5, 0.2, d) * 0.5);
          }
        `}
      />
    </points>
  );
};

const Particles: React.FC<SceneProps> = ({ handsRef, mode, audioData, showSkeleton, drawStyle, aiConfig }) => {
  const meshRef = useRef<THREE.Points>(null);
  const drawingRef = useRef<THREE.Points>(null);
  const transitionRef = useRef({ intensity: 1.0 });
  const smoothedLandmarksRef = useRef<THREE.Vector3[]>([]);
  const { camera } = useThree();

  const activeFriction = useRef(PHYSICS.friction);
  const activeAttract = useRef(PHYSICS.attractForce);
  const activeMaxSpeed = useRef(PHYSICS.maxSpeed);

  useEffect(() => {
    if (aiConfig) {
      gsap.to(activeFriction, { current: aiConfig.friction, duration: 2 });
      gsap.to(activeAttract, { current: aiConfig.attractForce, duration: 2 });
      gsap.to(activeMaxSpeed, { current: aiConfig.maxSpeed, duration: 2 });
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
    const time = state.clock.getElapsedTime();
    const tIntensity = transitionRef.current.intensity;

    const handCount = hands.length;
    const hPositions = hands.map(h => ({
        x: h.palm.x * 5, y: h.palm.y * 3, z: h.palm.z * 5, isOpen: h.isOpen, isPinching: h.isPinching
    }));

    const attractFalloffSq = PHYSICS.attractFalloff * PHYSICS.attractFalloff;
    const repelFalloffSq = PHYSICS.repelFalloff * PHYSICS.repelFalloff;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let x = posArr[i3], y = posArr[i3 + 1], z = posArr[i3 + 2];
      let vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];

      for (let j = 0; j < handCount; j++) {
        const h = hPositions[j];
        const dx = h.x - x, dy = h.y - y, dz = h.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;

        if (h.isOpen && d2 < attractFalloffSq) {
          const dist = Math.sqrt(d2);
          const force = (PHYSICS.attractFalloff - dist) * activeAttract.current;
          vx += (dx / dist) * force; vy += (dy / dist) * force; vz += (dz / dist) * force;
        } else if (!h.isPinching && d2 < repelFalloffSq) {
          const dist = Math.sqrt(d2);
          const force = (PHYSICS.repelFalloff - dist) * (aiConfig?.repelForce || PHYSICS.repelForce);
          vx -= (dx / dist) * force; vy -= (dy / dist) * force; vz -= (dz / dist) * force;
        }
      }

      if (mode === AppMode.PLAYGROUND || mode === AppMode.AI_ORACLE) {
        vx += (initialPositions[i3] - x) * PHYSICS.returnHomeForce * tIntensity;
        vy += (initialPositions[i3+1] - y) * PHYSICS.returnHomeForce * tIntensity;
        vz += (initialPositions[i3+2] - z) * PHYSICS.returnHomeForce * tIntensity;
      }

      vx *= activeFriction.current; vy *= activeFriction.current; vz *= activeFriction.current;
      const speedSq = vx*vx + vy*vy + vz*vz;
      if (speedSq > activeMaxSpeed.current ** 2) {
        const s = activeMaxSpeed.current / Math.sqrt(speedSq);
        vx *= s; vy *= s; vz *= s;
      }

      x += vx; y += vy; z += vz;
      const limit = PHYSICS.boundaryLimit;
      if (Math.abs(x) > limit) { x = Math.sign(x) * limit; vx *= -0.9; }
      if (Math.abs(y) > limit) { y = Math.sign(y) * limit; vy *= -0.9; }
      if (Math.abs(z) > limit) { z = Math.sign(z) * limit; vz *= -0.9; }

      posArr[i3] = x; posArr[i3+1] = y; posArr[i3+2] = z;
      velocities[i3] = vx; velocities[i3+1] = vy; velocities[i3+2] = vz;

      const currentSpeed = Math.sqrt(speedSq);
      const hueShift = Math.min(currentSpeed * 2, 1);
      const hVal = PARTICLE_VISUALS.hueRange.min + ((PARTICLE_VISUALS.hueRange.max - PARTICLE_VISUALS.hueRange.min) * hueShift);
      
      const targetCol = new THREE.Color().setHSL(hVal, 0.8, 0.5);
      if (aiConfig) {
        const baseCol = new THREE.Color(aiConfig.primary);
        const altCol = new THREE.Color(aiConfig.secondary);
        targetCol.lerp(baseCol, 0.5).lerp(altCol, hueShift * 0.5);
      }

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
      <Canvas camera={{ position: [0, 0, 8], fov: 75 }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
        <color attach="background" args={['#010101']} />
        <ambientLight intensity={0.5} />
        <Nebula audioData={props.audioData} colorA={pColor} colorB={sColor} />
        <Grid audioData={props.audioData} color={pColor} />
        <Background audioData={props.audioData} />
        <Particles {...props} />
        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.85} mipmapBlur intensity={1.0 + props.audioData * 1.5} radius={0.4} />
          <ChromaticAberration offset={new THREE.Vector2(0.001 * props.audioData, 0.001 * props.audioData)} />
          <Noise opacity={0.03} />
          <Vignette eskil={false} offset={0.1} darkness={1.2} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default Experience;
