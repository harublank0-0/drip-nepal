function Typography({ children }: { children: React.ReactNode }) {
  return <p className="leading-7 [&:not(:first-child)]:mt-6">{children}</p>
}

Typography.H1 = ({ children }: { children: React.ReactNode }) => {
  return (
    <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
      {children}
    </h1>
  )
}

Typography.H2 = ({ children }: { children: React.ReactNode }) => {
  return (
    <h2 className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  )
}

Typography.H3 = ({ children }: { children: React.ReactNode }) => {
  return <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">{children}</h3>
}

Typography.H4 = ({ children }: { children: React.ReactNode }) => {
  return <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">{children}</h4>
}

Typography.P = ({ children }: { children: React.ReactNode }) => {
  return <p className="leading-7 [&:not(:first-child)]:mt-6">{children}</p>
}

Typography.BlockQuote = ({ children }: { children: React.ReactNode }) => {
  return <blockquote className="mt-6 border-l-2 pl-6 italic">&quot;{children}&quot;</blockquote>
}

Typography.List = ({ children }: { children: React.ReactNode }) => {
  return <ul className="my-6 ml-6 list-disc [&>li]:mt-2">{children}</ul>
}

Typography.InlineCode = ({ children }: { children: React.ReactNode }) => {
  return (
    <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
      {children}
    </code>
  )
}

Typography.Lead = ({ children }: { children: React.ReactNode }) => {
  return <p className="text-xl text-muted-foreground">{children}</p>
}

Typography.Large = ({ children }: { children: React.ReactNode }) => {
  return <div className="text-lg font-semibold">{children}</div>
}

Typography.Small = ({ children }: { children: React.ReactNode }) => {
  return <small className="text-sm leading-none font-medium">{children}</small>
}

Typography.Muted = ({ children }: { children: React.ReactNode }) => {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
