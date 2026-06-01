import { type Data } from '@generated/data'
import { toast, Toaster } from 'sonner'
import { usePage } from '@inertiajs/react'
import { type ReactElement, useEffect } from 'react'
import { Link } from '@adonisjs/inertia/react'
import { Button } from '~/components/ui/button'
import { NavBar } from '~/components/navbar'

export default function Layout({
  children,
  ...rest
}: {
  children: ReactElement<Data.SharedProps>
}) {
  const { url } = usePage()
  useEffect(() => {
    toast.dismiss()
  }, [url])

  useEffect(() => {
    if (children.props.flash.error) {
      toast.error(children.props.flash.error)
    }
    if (children.props.flash.success) {
      toast.success(children.props.flash.success)
    }
  })

  console.log({ rest })

  return (
    <>
      {/* <Button asChild className="absolute"> */}
      {/*   <Link route="session.destroy">logout</Link> */}
      {/* </Button> */}
      <NavBar />
      <main>{children}</main>
      <Toaster position="top-center" richColors />
    </>
  )
}
