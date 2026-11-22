import type { ReactNode } from 'react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '~/components/ui/empty'

/*
 * A list or page with nothing to show (docs/08 §4.3): it says why, and
 * offers the next action when there is one.
 */
export function EmptyState({
  heading,
  body,
  children,
}: {
  heading: string
  body: string
  children?: ReactNode
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{heading}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
}
