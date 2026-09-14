'use client';

/**
 * Hero3D — Persistent React Three Fiber canvas for the landing page.
 *
 * Lives behind all HTML sections (position: fixed, z-index: 0).
 * Reads scroll progress from a shared ref (no React re-renders) and animates
 * the camera + scene contents accordingly.
 *
 * Scene contents (cinematic scoreboard morph):
 *   Phase 1 (hero, scroll 0–0.15): LED scoreboard with glowing mint cells,
 *     slow rotation, particle field around it.
 *   Phase 2 (live scoring, 0.15–0.30): Scoreboard rotates away + fades; phone
 *     with live scorecard UI rotates in.
 *   Phase 3 (tournament, 0.30–0.45): Phone tilts, schedule grid fades in.
 *   Phase 4 (spectator, 0.45–0.60): Spectator phone appears beside scorer phone.
 *   Phase 5 (charts, 0.60–0.75): Phones rotate away, run-rate worm draws in.
 *   Phase 6 (stats, 0.75–0.90): Worm dissolves into dense particle cloud.
 *   Phase 7 (CTA, 0.90–1.0): Particles converge into the GullyScore logo.
 *
 * Performance:
 *   - dpr capped at [1, 1.5] to limit fill rate on retina
 *   - particle count scales down on mobile (window.innerWidth < 768)
 *   - All meshes use simple standard materials, no heavy shaders
 *   - The canvas is behind everything (pointerEvents: none) so it never
 *     blocks scroll/clicks on the HTML sections above
 */

import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useRef, useMemo, Suspense } from 'react';
import * as THREE from 'three';

interface SceneProps {
  scrollRef: React.MutableRefObject<number>;
  isMobile: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Particle field — 1500 desktop / 700 mobile points in a loose sphere
// ─────────────────────────────────────────────────────────────────────
function ParticleField({ isMobile }: { isMobile: boolean }) {
  const count = isMobile ? 700 : 1500;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  const ref = useRef<THREE.Points>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.015;
      ref.current.rotation.x += delta * 0.005;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={isMobile ? 0.06 : 0.04}
        color="#00D4AA"
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Scoreboard — LED-style box with mint glow cells
// ─────────────────────────────────────────────────────────────────────
function Scoreboard({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);

  // Pre-create the LED "cells" layout (5 digit positions)
  const cells = useMemo(() => {
    return [
      { x: -1.4, slash: false },
      { x: -0.6, slash: false },
      { x: 0.2, slash: false },
      { x: 1.0, slash: true },
      { x: 1.6, slash: false },
    ];
  }, []);

  useFrame(() => {
    const p = scrollRef.current;
    const visible = p < 0.18 ? 1 : p < 0.28 ? 1 - (p - 0.18) / 0.1 : 0;
    if (groupRef.current) {
      groupRef.current.rotation.y = (1 - visible) * -Math.PI * 0.6;
      groupRef.current.rotation.x = (1 - visible) * 0.3;
      groupRef.current.position.x = (1 - visible) * -4;
      groupRef.current.position.y = (1 - visible) * 1.5;
      const scale = 0.6 + visible * 0.4;
      groupRef.current.scale.setScalar(scale);
      groupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.opacity = visible;
          mat.transparent = true;
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main scoreboard panel */}
      <RoundedBox args={[5, 2.8, 0.25]} radius={0.05} smoothness={2}>
        <meshStandardMaterial
          color="#050508"
          metalness={0.5}
          roughness={0.4}
          emissive="#00D4AA"
          emissiveIntensity={0.05}
        />
      </RoundedBox>
      {/* Inner dark screen */}
      <mesh position={[0, 0, 0.13]}>
        <planeGeometry args={[4.6, 2.4]} />
        <meshStandardMaterial color="#020208" emissive="#001a14" />
      </mesh>
      {/* LED "digit" cells — small mint planes arranged to suggest 247/4 */}
      {cells.map((digit, i) =>
        digit.slash ? (
          <mesh key={i} position={[digit.x, 0, 0.15]} rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry args={[0.08, 1.2]} />
            <meshBasicMaterial color="#00D4AA" />
          </mesh>
        ) : (
          <group key={i} position={[digit.x, 0, 0.15]}>
            {[0, 1, 2, 3, 4].map((row) =>
              [0, 1, 2].map((col) => {
                const on = (i * 7 + row * 3 + col) % 3 !== 0;
                return (
                  <mesh key={`${row}-${col}`} position={[(col - 1) * 0.18, (2 - row) * 0.25, 0]}>
                    <planeGeometry args={[0.14, 0.18]} />
                    <meshBasicMaterial
                      color="#00D4AA"
                      transparent
                      opacity={on ? 0.9 : 0.08}
                    />
                  </mesh>
                );
              })
            )}
          </group>
        )
      )}
      {/* Glowing accent strips top + bottom */}
      <mesh position={[0, 1.5, 0.13]}>
        <planeGeometry args={[5, 0.04]} />
        <meshBasicMaterial color="#00D4AA" />
      </mesh>
      <mesh position={[0, -1.5, 0.13]}>
        <planeGeometry args={[5, 0.04]} />
        <meshBasicMaterial color="#00D4AA" />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Phone — rounded box with screen + UI elements (the scorer's phone)
// ─────────────────────────────────────────────────────────────────────
function Phone({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const p = scrollRef.current;
    const t = clock.getElapsedTime();
    let visible: number;
    if (p < 0.15) visible = 0;
    else if (p < 0.28) visible = (p - 0.15) / 0.13;
    else if (p < 0.65) visible = 1;
    else if (p < 0.75) visible = 1 - (p - 0.65) / 0.1;
    else visible = 0;

    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 0.4) * 0.05;
      groupRef.current.rotation.y = (1 - visible) * -Math.PI * 0.5 + Math.sin(t * 0.3) * 0.03;
      groupRef.current.rotation.x = (1 - visible) * 0.2;
      groupRef.current.position.x = (1 - visible) * 4 + Math.sin(t * 0.2) * 0.02;
      const scale = 0.7 + visible * 0.3;
      groupRef.current.scale.setScalar(scale);
      groupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const mat = obj.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
          mat.opacity = visible;
          mat.transparent = true;
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      <RoundedBox args={[1.8, 3.6, 0.18]} radius={0.18} smoothness={3}>
        <meshStandardMaterial color="#0A0A0F" metalness={0.6} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0, 0.1]}>
        <planeGeometry args={[1.55, 3.35]} />
        <meshBasicMaterial color="#070710" />
      </mesh>
      {/* Top status bar — mint accent */}
      <mesh position={[0, 1.45, 0.11]}>
        <planeGeometry args={[1.4, 0.08]} />
        <meshBasicMaterial color="#00D4AA" />
      </mesh>
      {/* "LIVE" indicator dot */}
      <mesh position={[-0.55, 1.15, 0.11]}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color="#FF4444" />
      </mesh>
      {/* Score number block bg */}
      <mesh position={[0, 0.55, 0.11]}>
        <planeGeometry args={[1.35, 0.9]} />
        <meshBasicMaterial color="#0F0F1A" />
      </mesh>
      {/* Team color stripes */}
      <mesh position={[-0.5, 0.55, 0.12]}>
        <planeGeometry args={[0.05, 0.8]} />
        <meshBasicMaterial color="#00D4AA" />
      </mesh>
      <mesh position={[0.5, 0.55, 0.12]}>
        <planeGeometry args={[0.05, 0.8]} />
        <meshBasicMaterial color="#FF6B35" />
      </mesh>
      {/* Run rate worm — mint + orange dots */}
      {[-0.4, -0.25, -0.05, 0.15, 0.3, 0.45].map((x, i) => (
        <mesh key={i} position={[x, -0.4, 0.11]}>
          <circleGeometry args={[0.04, 8]} />
          <meshBasicMaterial color={i > 3 ? '#FF6B35' : '#00D4AA'} />
        </mesh>
      ))}
      {/* Recent balls strip */}
      {[-0.6, -0.4, -0.2, 0, 0.2, 0.4].map((x, i) => (
        <mesh key={i} position={[x, -0.95, 0.11]}>
          <planeGeometry args={[0.16, 0.16]} />
          <meshBasicMaterial
            color={i === 5 ? '#FF6B35' : i === 2 ? '#FF4444' : '#1A1A2E'}
          />
        </mesh>
      ))}
      {/* Bottom CTA button area */}
      <mesh position={[0, -1.45, 0.11]}>
        <planeGeometry args={[1.2, 0.4]} />
        <meshBasicMaterial color="#00D4AA" />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Spectator phone — second smaller phone, appears in section 4
// ─────────────────────────────────────────────────────────────────────
function SpectatorPhone({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const p = scrollRef.current;
    const t = clock.getElapsedTime();
    let visible: number;
    if (p < 0.45) visible = 0;
    else if (p < 0.55) visible = (p - 0.45) / 0.1;
    else if (p < 0.65) visible = 1;
    else if (p < 0.75) visible = 1 - (p - 0.65) / 0.1;
    else visible = 0;

    if (groupRef.current) {
      groupRef.current.position.x = 2.2 + (1 - visible) * 4;
      groupRef.current.position.y = Math.sin(t * 0.5 + 1) * 0.05;
      groupRef.current.rotation.y = -Math.PI * 0.15 + Math.sin(t * 0.4) * 0.04;
      const scale = (0.55 + visible * 0.15) * visible;
      groupRef.current.scale.setScalar(scale || 0.001);
      groupRef.current.visible = visible > 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      <RoundedBox args={[1.5, 3, 0.15]} radius={0.15} smoothness={3}>
        <meshStandardMaterial color="#0A0A0F" metalness={0.6} roughness={0.4} transparent />
      </RoundedBox>
      <mesh position={[0, 0, 0.08]}>
        <planeGeometry args={[1.3, 2.8]} />
        <meshBasicMaterial color="#070710" transparent />
      </mesh>
      {/* "Spectator" badge */}
      <mesh position={[0, 1.1, 0.09]}>
        <planeGeometry args={[1.1, 0.25]} />
        <meshBasicMaterial color="#FFD700" transparent opacity={0.2} />
      </mesh>
      {/* Score block */}
      <mesh position={[0, 0.4, 0.09]}>
        <planeGeometry args={[1.15, 0.7]} />
        <meshBasicMaterial color="#0F0F1A" transparent />
      </mesh>
      {/* Sync indicator dots — mint pulse pattern */}
      {[-0.4, -0.2, 0, 0.2, 0.4].map((x, i) => (
        <mesh key={i} position={[x, -0.5, 0.09]}>
          <circleGeometry args={[0.05, 8]} />
          <meshBasicMaterial color={i === 2 ? '#00D4AA' : '#1A1A2E'} transparent />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Run-rate worm — animated line that draws in during charts section
// ─────────────────────────────────────────────────────────────────────
function RunRateWorm({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);

  const points = useMemo(() => {
    const arr: THREE.Vector3[] = [];
    const N = 50;
    for (let i = 0; i < N; i++) {
      const x = -4 + (i / (N - 1)) * 8;
      const t = i / (N - 1);
      const y = Math.sin(t * Math.PI * 2.5) * 0.4 + t * 0.3 - 0.5;
      arr.push(new THREE.Vector3(x, y, 0));
    }
    return arr;
  }, []);

  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  const dotsRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const p = scrollRef.current;
    let visible: number;
    if (p < 0.6) visible = 0;
    else if (p < 0.7) visible = (p - 0.6) / 0.1;
    else if (p < 0.78) visible = 1;
    else if (p < 0.85) visible = 1 - (p - 0.78) / 0.07;
    else visible = 0;

    if (groupRef.current) {
      groupRef.current.rotation.x = (1 - visible) * -0.3;
      groupRef.current.position.z = (1 - visible) * -3;
      groupRef.current.scale.setScalar(0.001 + visible);
      groupRef.current.visible = visible > 0.01;
    }
    if (dotsRef.current) {
      dotsRef.current.children.forEach((child, i) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const reveal = visible * Math.max(0, Math.min(1, (visible * 50 - i) / 5));
        mat.opacity = reveal;
      });
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <line>
        <primitive object={geometry} attach="geometry" />
        <lineBasicMaterial color="#00D4AA" transparent opacity={0.6} />
      </line>
      <group ref={dotsRef}>
        {points.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshBasicMaterial color={i > 35 ? '#FF6B35' : '#00D4AA'} transparent opacity={0} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Scene — orchestrates camera + all elements
// ─────────────────────────────────────────────────────────────────────
function Scene({ scrollRef, isMobile }: SceneProps) {
  useFrame(({ camera, clock }) => {
    const p = scrollRef.current;
    const t = clock.getElapsedTime();

    // Camera drifts subtly based on scroll + idle drift
    const targetX = Math.sin(p * Math.PI) * 1.5 + Math.sin(t * 0.2) * 0.2;
    const targetY = -p * 0.8 + Math.cos(t * 0.15) * 0.15;
    const targetZ = 8 - Math.sin(p * Math.PI) * 1.5;

    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += (targetY - camera.position.y) * 0.04;
    camera.position.z += (targetZ - camera.position.z) * 0.04;
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight position={[6, 4, 6]} intensity={1.8} color="#00D4AA" />
      <pointLight position={[-6, -3, 4]} intensity={0.9} color="#FF6B35" />
      <pointLight position={[0, 5, -5]} intensity={0.6} color="#F0F0F5" />
      <fog attach="fog" args={['#070710', 10, 30]} />
      <ParticleField isMobile={isMobile} />
      <Scoreboard scrollRef={scrollRef} />
      <Phone scrollRef={scrollRef} />
      <SpectatorPhone scrollRef={scrollRef} />
      <RunRateWorm scrollRef={scrollRef} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Default export — the Canvas wrapper
// ─────────────────────────────────────────────────────────────────────
export default function Hero3D({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
  const isMobile =
    typeof window !== 'undefined' && window.innerWidth < 768 ? true : false;

  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 50 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        background: 'transparent',
        zIndex: 0,
      }}
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
    >
      <Suspense fallback={null}>
        <Scene scrollRef={scrollRef} isMobile={isMobile} />
      </Suspense>
    </Canvas>
  );
}
