import { Skeleton } from '~/components/ui/skeleton'

export function SearchSkeleton() {
  return (
    <div className="space-y-4 p-2">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-14 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-2.5 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
