import { animate, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef } from 'react'

/**
 * A number that counts to its value on arrival and rolls from the old value to
 * the new one when it changes (e.g. right after registering an expense).
 * With "reduce motion" on, it simply shows the value.
 */
export function useAnimatedNumber(value: number, format: (n: number) => string): { text: MotionValue<string>; changed: number } {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const text = useTransform(mv, format)
  const first = useRef(true)
  const changes = useRef(0)
  const last = useRef(value)

  if (!first.current && last.current !== value) {
    changes.current += 1
  }
  last.current = value

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      first.current = false
      return
    }
    const controls = animate(mv, value, { duration: first.current ? 1.1 : 0.7, ease: [0.16, 1, 0.3, 1] })
    first.current = false
    return () => controls.stop()
  }, [value, reduce, mv])

  return { text, changed: changes.current }
}
