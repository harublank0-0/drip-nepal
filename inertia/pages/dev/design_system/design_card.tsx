import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

export function DesignCard() {
  return (
    <Card className="w-64">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">Example Card</CardContent>
    </Card>
  )
}
