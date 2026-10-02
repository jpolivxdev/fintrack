import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { createPortal } from 'react-dom'

const COLORS = ['var(--primary)', 'var(--income)', '#f59e0b', '#38bdf8', '#f472b6']

/**
 * A short burst of coins and sparks for a real milestone (a goal reached).
 * Pure transforms, ~1.2 s, then it removes itself. Skipped with reduced motion.
 */
export function Celebrate({ burst, onDone }: { burst: number; onDone: () => void }) {
  const reduce = useReducedMotion()
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.4
        const distance = 120 + Math.random() * 140
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - 60,
          rotate: Math.random() * 540 - 270,
          size: 6 + Math.random() * 8,
          round: i % 3 === 0,
          color: COLORS[i % COLORS.length],
          delay: Math.random() * 0.08,
        }
      }),
    // A new burst gets new pieces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst],
  )
  if (reduce || burst === 0) return null

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
      {pieces.map((p, i) => (
        <motion.span
          key={`${burst}-${i}`}
          className="absolute"
          style={{ width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.color, borderRadius: p.round ? 999 : 2 }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 140], opacity: [1, 1, 0], scale: 1, rotate: p.rotate }}
          transition={{ duration: 1.2, delay: p.delay, ease: [0.16, 1, 0.3, 1], times: [0, 0.55, 1] }}
          onAnimationComplete={i === 0 ? onDone : undefined}
        />
      ))}
    </div>,
    document.body,
  )
}
