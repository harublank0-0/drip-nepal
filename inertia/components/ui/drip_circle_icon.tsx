import { LucideCircle, LucideProps } from 'lucide-react'

type DripCircleIconProps = LucideProps & {
  children: React.ReactNode
}

export const DripCircleIcon = ({ children, ...rest }: DripCircleIconProps) => {
  return (
    <div className="relative flex items-center justify-center h-fit w-fit">
      <LucideCircle size={48} className="absolute" strokeWidth={1} {...rest} />
      {children}
    </div>
  )
}
