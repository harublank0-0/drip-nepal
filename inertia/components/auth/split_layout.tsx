import { type ReactNode } from 'react'

type SplitLayoutProps = {
  left: ReactNode
  right: ReactNode
}

export function SplitLayout({ left, right }: SplitLayoutProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      <div className="flex w-full items-center justify-center lg:w-[45%]">
        {left}
      </div>
      <div className="flex w-full items-center justify-center lg:w-[55%]">
        {right}
      </div>
    </div>
  )
}
