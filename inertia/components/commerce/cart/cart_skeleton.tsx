import { Skeleton } from '~/components/ui/skeleton'

export function CartItemSkeleton() {
  return (
    <div className="flex gap-3 py-4">
      <Skeleton className="size-[80px] shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <div className="flex items-center gap-2 mt-1">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
      </div>
    </div>
  )
}

export function SummarySkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  )
}

export function RecommendationSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="min-w-[160px] shrink-0 space-y-2">
          <Skeleton className="aspect-[4/5] w-full rounded-lg" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}
