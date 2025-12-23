
import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { PARTICLE_COUNT, MAX_DRAW_POINTS, THEME, PHYSICS, DRAWING_CONFIG, PARTICLE_VISUALS } from '../constants';
import { AppMode, HandData, DrawingStyle } from '../types';

interface SceneProps {
  handsRef: React.MutableRefObject<HandData[]>;
  mode: AppMode;
  audioData: number;
  showSkeleton: boolean;
  drawStyle: DrawingStyle;
}

const Nebula: React.FC<{ audioData: number }> = ({ audioData }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAudio: { value: 0 },
    uColorA: { value: new THREE.Color('#05001a') }, // Much darker purple
    uColorB: { value: new THREE.Color('#000a1a') }  // Much darker cyan
  }), []);

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
            float dist = length(vPosition);
            // Drastically reduced alpha and made it more 'patchy' to avoid white-out
            float alpha = smoothstep(0.9, 1.1, n + uAudio * 0.2);
            vec3 finalColor = mix(uColorA, uColorB, n);
            gl_FragColor = vec4(finalColor, alpha * 0.04);
          }
        `}
      />
    </mesh>
  );
};

const Grid: React.FC<{ audioData: number }> = ({ audioData }) => {
  const gridRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (gridRef.current) {
      const pulse = 1 + Math.sin(state.clock.getElapsedTime() * 1.5) * 0.02 + audioData * 0.1;
      gridRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  return (
    <group ref={gridRef} rotation={[Math.PI / 2, 0, 0]}>
      <gridHelper args={[100, 50, '#111', '#050505']} position={[0, -8, 0]}>
        <meshBasicMaterial transparent opacity={0.03} color={THEME.primary} />
      </gridHelper>
      <gridHelper args={[100, 50, '#111', '#050505']} position={[0, 8, 0]}>
        <meshBasicMaterial transparent opacity={0.03} color={THEME.primary} />
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
      pos.set([
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      ], i * 3);
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
        uniforms={{
          uColor: { value: new THREE.Color(THEME.star) }
        }}
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

const Particles: React.FC<SceneProps> = ({ handsRef, mode, audioData, showSkeleton, drawStyle }) => {
  const meshRef = useRef<THREE.Points>(null);
  const drawingRef = useRef<THREE.Points>(null);
  const arcsRef = useRef<THREE.LineSegments>(null);
  const transitionRef = useRef({ intensity: 1.0 });
  const smoothedLandmarksRef = useRef<THREE.Vector3[]>([]);
  const { camera } = useThree();

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

  const silhouetteOffsets = useMemo(() => {
    const offsets = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      offsets[i * 3] = (Math.random() - 0.5) * 0.4;
      offsets[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
      offsets[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    return offsets;
  }, []);

  useEffect(() => {
    gsap.fromTo(transitionRef.current, 
      { intensity: 0.1 }, 
      { intensity: 1.0, duration: 1.5, ease: "expo.out" }
    );
  }, [mode]);

  const drawPositions = useMemo(() => new Float32Array(MAX_DRAW_POINTS * 3), []);
  const drawIdx = useRef(0);

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

    let midPoint: THREE.Vector3 | null = null;
    let handsDist = 0;
    const arcPoints: number[] = [];

    const currentTargets: THREE.Vector3[] = [];
    if (hands.length > 0) {
      let lmIdx = 0;
      hands.forEach(hand => {
        hand.landmarks.forEach(lm => {
          const targetX = (1 - lm.x) * 10 - 5;
          const targetY = -(lm.y * 6 - 3);
          const targetZ = lm.z * -10;
          
          if (!smoothedLandmarksRef.current[lmIdx]) {
            smoothedLandmarksRef.current[lmIdx] = new THREE.Vector3(targetX, targetY, targetZ);
          } else {
            const lerpFactor = 0.12; 
            smoothedLandmarksRef.current[lmIdx].x = THREE.MathUtils.lerp(smoothedLandmarksRef.current[lmIdx].x, targetX, lerpFactor);
            smoothedLandmarksRef.current[lmIdx].y = THREE.MathUtils.lerp(smoothedLandmarksRef.current[lmIdx].y, targetY, lerpFactor);
            smoothedLandmarksRef.current[lmIdx].z = THREE.MathUtils.lerp(smoothedLandmarksRef.current[lmIdx].z, targetZ, lerpFactor);
          }
          currentTargets.push(smoothedLandmarksRef.current[lmIdx]);
          lmIdx++;
        });
      });
    }

    const handCount = hands.length;
    const hPositions = hands.map(h => ({
        x: h.palm.x * 5,
        y: h.palm.y * 3,
        z: h.palm.z * 5,
        isOpen: h.isOpen,
        isPinching: h.isPinching
    }));

    if (handCount === 2) {
      const v1 = new THREE.Vector3(hPositions[0].x, hPositions[0].y, hPositions[0].z);
      const v2 = new THREE.Vector3(hPositions[1].x, hPositions[1].y, hPositions[1].z);
      midPoint = v1.clone().lerp(v2, 0.5);
      handsDist = v1.distanceTo(v2);
      if (handsDist < 4) arcPoints.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    }

    if (handCount > 0) {
      const avgZ = hands.reduce((acc, h) => acc + h.palm.z, 0) / handCount;
      const targetFov = 75 + (avgZ * 15);
      const pCam = camera as THREE.PerspectiveCamera;
      pCam.fov = THREE.MathUtils.lerp(pCam.fov, targetFov, 0.1);
      pCam.updateProjectionMatrix();
    }

    if (arcsRef.current) {
      const arcPos = arcsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      if (arcPoints.length > 0) {
        arcPos.set(new Float32Array(arcPoints));
        arcsRef.current.visible = true;
      } else {
        arcsRef.current.visible = false;
      }
      arcPos.needsUpdate = true;
    }

    const attractFalloffSq = PHYSICS.attractFalloff * PHYSICS.attractFalloff;
    const repelFalloffSq = PHYSICS.repelFalloff * PHYSICS.repelFalloff;
    const compressFalloffSq = PHYSICS.compressFalloff * PHYSICS.compressFalloff;
    const silhouetteCount = currentTargets.length;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let x = posArr[i3];
      let y = posArr[i3 + 1];
      let z = posArr[i3 + 2];
      let vx = velocities[i3];
      let vy = velocities[i3 + 1];
      let vz = velocities[i3 + 2];

      for (let j = 0; j < handCount; j++) {
        const h = hPositions[j];
        const dx = h.x - x;
        const dy = h.y - y;
        const dz = h.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;

        if (h.isOpen && d2 < attractFalloffSq) {
          const dist = Math.sqrt(d2);
          const force = (PHYSICS.attractFalloff - dist) * PHYSICS.attractForce;
          vx += (dx / dist) * force;
          vy += (dy / dist) * force;
          vz += (dz / dist) * force;
        } else if (!h.isPinching && d2 < repelFalloffSq) {
          const dist = Math.sqrt(d2);
          const explodeForce = (PHYSICS.repelFalloff - dist) * PHYSICS.repelForce;
          vx -= (dx / dist) * explodeForce;
          vy -= (dy / dist) * explodeForce;
          vz -= (dz / dist) * explodeForce;
        }
      }

      if (mode === AppMode.SILHOUETTE && silhouetteCount > 0) {
        const target = currentTargets[i % silhouetteCount];
        const tx = target.x + silhouetteOffsets[i3];
        const ty = target.y + silhouetteOffsets[i3 + 1];
        const tz = target.z + silhouetteOffsets[i3 + 2];
        vx += (tx - x) * PHYSICS.silhouetteSmoothing * tIntensity;
        vy += (ty - y) * PHYSICS.silhouetteSmoothing * tIntensity;
        vz += (tz - z) * PHYSICS.silhouetteSmoothing * tIntensity;
      } else if (mode === AppMode.SILHOUETTE || mode === AppMode.PLAYGROUND) {
        vx += (initialPositions[i3] - x) * PHYSICS.returnHomeForce * tIntensity;
        vy += (initialPositions[i3 + 1] - y) * PHYSICS.returnHomeForce * tIntensity;
        vz += (initialPositions[i3 + 2] - z) * PHYSICS.returnHomeForce * tIntensity;
      }

      if (midPoint && handsDist < 2.5) {
        const cDx = midPoint.x - x;
        const cDy = midPoint.y - y;
        const cDz = midPoint.z - z;
        const cDistSq = cDx * cDx + cDy * cDy + cDz * cDz;
        if (cDistSq < compressFalloffSq) {
          const cDist = Math.sqrt(cDistSq);
          const compressionAmount = (2.5 - handsDist) * (PHYSICS.compressFalloff - cDist) * PHYSICS.compressForce;
          vx += (cDx / cDist) * compressionAmount;
          vy += (cDy / cDist) * compressionAmount;
          vz += (cDz / cDist) * compressionAmount;
        }
      }

      if (mode === AppMode.AUDIO_REACTIVE) {
        const noiseVal = (Math.random() - 0.5) * audioData * 0.5;
        vx += noiseVal + Math.sin(time * 2 + i * 0.001) * audioData * 0.2;
        vy += noiseVal; vz += noiseVal;
      }

      vx *= PHYSICS.friction;
      vy *= PHYSICS.friction;
      vz *= PHYSICS.friction;

      const speedSq = vx*vx + vy*vy + vz*vz;
      x += vx; y += vy; z += vz;

      const limit = PHYSICS.boundaryLimit;
      if (Math.abs(x) > limit) { x = Math.sign(x) * limit; vx *= -0.9; }
      if (Math.abs(y) > limit) { y = Math.sign(y) * limit; vy *= -0.9; }
      if (Math.abs(z) > limit) { z = Math.sign(z) * limit; vz *= -0.9; }

      posArr[i3] = x;
      posArr[i3 + 1] = y;
      posArr[i3 + 2] = z;
      velocities[i3] = vx;
      velocities[i3 + 1] = vy;
      velocities[i3 + 2] = vz;

      const currentSpeed = Math.sqrt(speedSq);
      const hueShift = Math.min(currentSpeed * 2, 1);
      const hVal = PARTICLE_VISUALS.hueRange.min + ((PARTICLE_VISUALS.hueRange.max - PARTICLE_VISUALS.hueRange.min) * hueShift) + (audioData * 0.2);
      
      const lVal = PARTICLE_VISUALS.lightness;
      const sVal = PARTICLE_VISUALS.saturation;
      const cVal = (1 - Math.abs(2 * lVal - 1)) * sVal;
      const xCol = cVal * (1 - Math.abs((hVal * 6) % 2 - 1));
      const mVal = lVal - cVal / 2;
      let rVal = 0, gCol = 0, bVal = 0;
      const hInt = Math.floor(hVal * 6) % 6;
      if (hInt === 0) { rVal = cVal; gCol = xCol; }
      else if (hInt === 1) { rVal = xCol; gCol = cVal; }
      else if (hInt === 2) { gCol = cVal; bVal = xCol; }
      else if (hInt === 3) { gCol = xCol; bVal = cVal; }
      else if (hInt === 4) { rVal = xCol; bVal = cVal; }
      else { rVal = cVal; bVal = xCol; }
      
      colArr[i3] = rVal + mVal;
      colArr[i3 + 1] = gCol + mVal;
      colArr[i3 + 2] = bVal + mVal;

      let targetSize = PARTICLE_VISUALS.baseSize;
      for (let j = 0; j < handCount; j++) {
        const hPos = hPositions[j];
        const dS = (hPos.x-x)**2 + (hPos.y-y)**2 + (hPos.z-z)**2;
        if (dS < 4) targetSize += (2 - Math.sqrt(dS)) * 0.05;
      }
      targetSize += audioData * 0.1;
      sizeArr[i] = sizeArr[i] * 0.9 + targetSize * 0.1;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;

    if (mode === AppMode.AIR_DRAWING && drawingRef.current) {
      const drawAttr = drawingRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const dArr = drawAttr.array as Float32Array;
      hands.forEach(hand => {
        if (hand.isPinching) {
          dArr[drawIdx.current * 3] = hand.palm.x * 5;
          dArr[drawIdx.current * 3 + 1] = hand.palm.y * 3;
          dArr[drawIdx.current * 3 + 2] = hand.palm.z * 5;
          drawIdx.current = (drawIdx.current + 1) % MAX_DRAW_POINTS;
        }
      });
      drawAttr.needsUpdate = true;
    }
  });

  return (
    <>
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

      <lineSegments ref={arcsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={new Float32Array(6)} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={THEME.energy} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
      </lineSegments>

      {mode === AppMode.AIR_DRAWING && (
        <points ref={drawingRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={MAX_DRAW_POINTS} array={drawPositions} itemSize={3} />
          </bufferGeometry>
          <pointsMaterial size={0.1} color={THEME.accent} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
        </points>
      )}

      {showSkeleton && handsRef.current.map((hand, idx) => (
        <group key={idx}>
          {hand.landmarks.map((lm, i) => (
            <mesh key={i} position={[ (1-lm.x)*10 - 5, -(lm.y*6-3), lm.z*-10 ]}>
              <sphereGeometry args={[0.02, 6, 6]} />
              <meshBasicMaterial color={hand.isRight ? THEME.primary : THEME.accent} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
};

const Experience: React.FC<SceneProps> = (props) => {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 8], fov: 75 }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
        <color attach="background" args={['#010101']} />
        <ambientLight intensity={0.5} />
        <Nebula audioData={props.audioData} />
        <Grid audioData={props.audioData} />
        <Background audioData={props.audioData} />
        <Particles {...props} />
        {/* Adjusted Bloom: increased luminanceThreshold to 0.85 to only glow particles, not background */}
        <EffectComposer enableNormalPass={false}>
          <Bloom 
            luminanceThreshold={0.85} 
            mipmapBlur 
            intensity={1.0 + props.audioData * 1.5} 
            radius={0.4} 
          />
          <ChromaticAberration offset={new THREE.Vector2(0.001 * props.audioData, 0.001 * props.audioData)} />
          <Noise opacity={0.03} />
          <Vignette eskil={false} offset={0.1} darkness={1.2} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default Experience;
