import { useEffect, useRef } from 'react'

export const useMousePosition = () => {
  const iconRef = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const mousePos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    return () => {
      if (frame.current) {
        cancelAnimationFrame(frame.current)
      }
    }
  }, [])

  const onTrackMousePosition: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const { clientX, clientY } = e
    mousePos.current = {
      x: clientX,
      y: clientY,
    }

    if (frame.current) return

    frame.current = requestAnimationFrame(() => {
      const { x, y } = mousePos.current

      iconRef.current?.style.setProperty('transform', `translate3d(${x - 24}px, ${y - 24}px, 0)`)

      frame.current = null
    })
  }

  return {
    iconRef,
    onTrackMousePosition,
  }
}
