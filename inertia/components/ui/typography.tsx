import { cn } from '~/lib/utils'

type TypographyProps = {
  children: React.ReactNode
  className?: string
}
export function Typography({ children, className }: TypographyProps) {
  return <p className={cn('leading-7 [&:not(:first-child)]:mt-6', className)}>{children}</p>
}

function H1({ children, className }: TypographyProps) {
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
Typography.H1 = H1

function H2({ children, className }: TypographyProps) {
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
Typography.H2 = H2

function H3({ children, className }: TypographyProps) {
  return (
    <h3 className={cn('scroll-m-20 text-2xl font-semibold tracking-tight', className)}>
      {children}
    </h3>
  )
}
Typography.H3 = H3

function H4({ children, className }: TypographyProps) {
  return (
    <h4 className={cn('scroll-m-20 text-xl font-semibold tracking-tight', className)}>
      {children}
    </h4>
  )
}
Typography.H4 = H4

function P({ children, className }: TypographyProps) {
  return <p className={cn('leading-7 [&:not(:first-child)]:mt-6', className)}>{children}</p>
}
Typography.P = P

function BlockQuote({ children, className }: TypographyProps) {
  return (
    <blockquote className={cn('mt-6 border-l-2 pl-6 italic', className)}>
      &quot;{children}&quot;
    </blockquote>
  )
}
Typography.BlockQuote = BlockQuote

function List({ children, className }: TypographyProps) {
  return <ul className={cn('my-6 ml-6 list-disc [&>li]:mt-2', className)}>{children}</ul>
}
Typography.List = List

function InlineCode({ children, className }: TypographyProps) {
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
Typography.InlineCode = InlineCode

function Lead({ children, className }: TypographyProps) {
  return <p className={cn('text-xl text-muted-foreground', className)}>{children}</p>
}
Typography.Lead = Lead

function Large({ children, className }: TypographyProps) {
  return <div className={cn('text-lg font-semibold', className)}>{children}</div>
}
Typography.Large = Large

function Small({ children, className }: TypographyProps) {
  return <small className={cn('text-sm leading-none font-medium', className)}>{children}</small>
}
Typography.Small = Small

function Muted({ children, className }: TypographyProps) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
}
Typography.Muted = Muted

function Strike({ children, className }: TypographyProps) {
  return <del className={cn('text-sm text-muted-foreground', className)}>{children}</del>
}
Typography.Strike = Strike

function Strong({ children, className }: TypographyProps) {
  return <strong className={cn('text-sm font-semibold', className)}>{children}</strong>
}
Typography.Strong = Strong
