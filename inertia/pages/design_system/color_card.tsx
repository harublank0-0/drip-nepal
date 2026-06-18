export function ColorCard({ name, bg, fg }: { name: string; bg: string; fg: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className={`${bg} ${fg} flex h-24 items-center justify-center`}>Aa</div>

      <div className="bg-background p-3">
        <p className="text-sm font-medium">{name}</p>
        <code className="text-muted-foreground text-xs">
          {bg} / {fg}
        </code>
      </div>
    </div>
  )
}
