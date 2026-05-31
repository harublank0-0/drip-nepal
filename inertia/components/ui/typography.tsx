import { cn } from '~/lib/utils'

type TypographyProps = {
  children: React.ReactNode
  className?: string
}
export function Typography({ children, className }: TypographyProps) {
  return <p className={cn('leading-7 [&:not(:first-child)]:mt-6', className)}>{children}</p>
}

Typography.H1 = ({ children, className }: TypographyProps) => {
  return (
    <h1
      className={cn(
        'scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance',
        className
      )}
    >
      {children}
    </h1>
  )
}

Typography.H2 = ({ children, className }: TypographyProps) => {
  return (
    <h2
      className={cn(
        'scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0',
        className
      )}
    >
      {children}
    </h2>
  )
}

Typography.H3 = ({ children, className }: TypographyProps) => {
  return (
    <h3 className={cn('scroll-m-20 text-2xl font-semibold tracking-tight', className)}>
      {children}
    </h3>
  )
}

Typography.H4 = ({ children, className }: TypographyProps) => {
  return (
    <h4 className={cn('scroll-m-20 text-xl font-semibold tracking-tight', className)}>
      {children}
    </h4>
  )
}

Typography.P = ({ children, className }: TypographyProps) => {
  return <p className={cn('leading-7 [&:not(:first-child)]:mt-6', className)}>{children}</p>
}

Typography.BlockQuote = ({ children, className }: TypographyProps) => {
  return (
    <blockquote className={cn('mt-6 border-l-2 pl-6 italic', className)}>
      &quot;{children}&quot;
    </blockquote>
  )
}

Typography.List = ({ children, className }: TypographyProps) => {
  return <ul className={cn('my-6 ml-6 list-disc [&>li]:mt-2', className)}>{children}</ul>
}

Typography.InlineCode = ({ children, className }: TypographyProps) => {
  return (
    <code
      className={cn(
        'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
        className
      )}
    >
      {children}
    </code>
  )
}

Typography.Lead = ({ children, className }: TypographyProps) => {
  return <p className={cn('text-xl text-muted-foreground', className)}>{children}</p>
}

Typography.Large = ({ children, className }: TypographyProps) => {
  return <div className={cn('text-lg font-semibold', className)}>{children}</div>
}

Typography.Small = ({ children, className }: TypographyProps) => {
  return <small className={cn('text-sm leading-none font-medium', className)}>{children}</small>
}

Typography.Muted = ({ children, className }: TypographyProps) => {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
}
