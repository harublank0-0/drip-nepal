type ShowProps = React.PropsWithChildren<{
  when: boolean
}>

export function Show(props: ShowProps) {
  return props.when ? props.children : null
}
