import type { Variants, Transition } from "framer-motion"

export const spring: Transition = { type: "spring", stiffness: 320, damping: 28, mass: 0.8 }
export const softSpring: Transition = { type: "spring", stiffness: 220, damping: 26, mass: 0.9 }
export const snappy: Transition = { type: "spring", stiffness: 500, damping: 32, mass: 0.6 }

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: spring },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: snappy },
}

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}

export const slideHorizontal: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 24 : -24 }),
  center: { opacity: 1, x: 0, transition: spring },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -24 : 24, transition: { duration: 0.18 } }),
}
