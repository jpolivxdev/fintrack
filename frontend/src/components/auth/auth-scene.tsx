import { RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, MathUtils, type Group, type Mesh } from 'three'

/** Abstract rising balance: twelve months as bars on an arc (illustrative, no data). */
const HEIGHTS = [0.8, 1.15, 1.0, 1.5, 1.3, 1.9, 1.65, 2.2, 1.95, 2.55, 2.3, 2.9]
const VIOLET = new Color('#8b5cf6')
const BLUE = new Color('#3b82f6')

function Bar({ index, height, reduced }: { index: number; height: number; reduced: boolean }) {
  const ref = useRef<Mesh>(null)
  const angle = MathUtils.degToRad(-62 + (124 / (HEIGHTS.length - 1)) * index)
  const color = useMemo(() => VIOLET.clone().lerp(BLUE, index / (HEIGHTS.length - 1)), [index])

  useFrame(({ clock }) => {
    if (!ref.current) return
    // Grow in, staggered, with an exponential ease-out; then breathe slightly.
    const t = reduced ? 1 : Math.min(1, Math.max(0, (clock.elapsedTime - index * 0.07) / 0.9))
    const eased = 1 - Math.pow(2, -10 * t)
    const breathe = reduced ? 0 : Math.sin(clock.elapsedTime * 0.8 + index * 0.5) * 0.04
    const h = Math.max(0.001, height * eased + breathe)
    ref.current.scale.y = h
    ref.current.position.y = h / 2
  })

  return (
    <group position={[Math.sin(angle) * 3.2, -1.4, -Math.cos(angle) * 3.2 + 2.2]} rotation={[0, -angle, 0]}>
      <RoundedBox ref={ref} args={[0.34, 1, 0.34]} radius={0.06} smoothness={4}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.32} metalness={0.25} />
      </RoundedBox>
    </group>
  )
}

function Bars({ reduced }: { reduced: boolean }) {
  const group = useRef<Group>(null)
  useFrame(({ pointer, clock }, delta) => {
    if (!group.current || reduced) return
    // Follow the mouse gently, plus a slow idle drift.
    const targetY = pointer.x * 0.35 + Math.sin(clock.elapsedTime * 0.15) * 0.08
    const targetX = -pointer.y * 0.12
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, targetY, 3, delta)
    group.current.rotation.x = MathUtils.damp(group.current.rotation.x, targetX, 3, delta)
  })
  return (
    <group ref={group} position={[0, 1.1, 0]} scale={0.74}>
      {HEIGHTS.map((h, i) => (
        <Bar key={i} index={i} height={h} reduced={reduced} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.41, -1]}>
        <ringGeometry args={[3.05, 3.35, 96, 1, -0.2, Math.PI + 0.4]} />
        <meshBasicMaterial color="#6d5bd0" transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

export default function AuthScene() {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <Canvas
      camera={{ position: [0, 2.2, 10.5], fov: 36 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      frameloop={reduced ? 'demand' : 'always'}
      aria-hidden
    >
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 6, 5]} intensity={1.4} />
      <pointLight position={[-4, 2, 2]} intensity={18} color="#8b5cf6" />
      <pointLight position={[4, 1, 3]} intensity={12} color="#3b82f6" />
      <Bars reduced={reduced} />
    </Canvas>
  )
}
