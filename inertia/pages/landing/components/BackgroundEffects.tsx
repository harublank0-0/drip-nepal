import { useEffect, useRef } from 'react'

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame: number
    const particles: {
      x: number
      y: number
      vx: number
      vy: number
      size: number
      alpha: number
    }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const count = Math.min(60, Math.floor((canvas.width * canvas.height) / 20000))
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${p.alpha})`
        ctx.fill()
      }
      frame = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
  )
}

function GradientOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-40 -right-40 h-[600px] w-[600px] animate-pulse rounded-full bg-[#6366F1]/20 blur-[120px]" />
      <div
        className="absolute -bottom-40 -left-40 h-[500px] w-[500px] animate-pulse rounded-full bg-[#8B5CF6]/15 blur-[120px]"
        style={{ animationDelay: '1s' }}
      />
      <div
        className="absolute top-1/2 left-1/3 h-[400px] w-[400px] animate-pulse rounded-full bg-[#22D3EE]/10 blur-[100px]"
        style={{ animationDelay: '2s' }}
      />
      <div
        className="absolute top-1/3 right-1/4 h-[300px] w-[300px] animate-pulse rounded-full bg-[#6366F1]/10 blur-[80px]"
        style={{ animationDelay: '3s' }}
      />
    </div>
  )
}

function GridPattern() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
      aria-hidden="true"
      style={{
        backgroundImage: `linear-gradient(rgba(99, 102, 241, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.3) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }}
    />
  )
}

export function BackgroundEffects() {
  return (
    <>
      <GridPattern />
      <GradientOrbs />
      <ParticleCanvas />
    </>
  )
}
