import { Skeleton } from '~/components/ui/skeleton'

export function ProductSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[4/5] rounded-lg mb-3" />
      <Skeleton className="h-3 w-16 mb-2" />
      <Skeleton className="h-4 w-full mb-1" />
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-12 mb-2" />
      <Skeleton className="h-4 w-24" />
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  )
}
