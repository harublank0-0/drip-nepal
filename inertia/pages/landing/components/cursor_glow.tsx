import { useEffect, useState } from 'react'

export function CursorGlow() {
  const [pos, setPos] = useState({ x: -200, y: -200 })

  useEffect(() => {
    let rafId: number
    const handleMouse = (e: MouseEvent) => {
      rafId = requestAnimationFrame(() => setPos({ x: e.clientX, y: e.clientY }))
    }
    window.addEventListener('mousemove', handleMouse)
    return () => {
      window.removeEventListener('mousemove', handleMouse)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-50 hidden md:block" aria-hidden="true">
      <div
        className="absolute h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.08] transition-transform duration-300 ease-out"
        style={{
          left: pos.x,
          top: pos.y,
          background: 'radial-gradient(circle, #6366F1 0%, #8B5CF6 40%, transparent 70%)',
        }}
      />
    </div>
  )
}
