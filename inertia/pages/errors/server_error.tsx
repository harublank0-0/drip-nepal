import { ErrorScreen } from '~/components/errors/error_screen'
import { Button } from '~/components/ui/button'

/*
 * 500–599 (docs/08 §8.3): an apology, a retry of the same URL and the
 * request ID support asks for. The handler passes only `request_id`, so no
 * error detail can reach this page (RF-36).
 */
export default function ServerError({ request_id }: { request_id: string | null }) {
  return (
    <ErrorScreen title="Something went wrong" heading="Sorry, something went wrong">
      <p className="text-muted-foreground">
        This is a problem on our side. Please try again in a moment.
      </p>
      <Button className="self-start" onClick={() => window.location.reload()}>
        Try again
      </Button>
      {request_id ? (
        <p className="text-sm text-muted-foreground">
          Reference: <code className="font-mono select-all">{request_id}</code>
        </p>
      ) : null}
    </ErrorScreen>
  )
}
