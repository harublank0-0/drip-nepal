import { useState } from 'react'
import { Card, CardContent } from '~/components/ui/card'
import { Typography } from '~/components/ui/typography'

type ColorVariant = {
  color: string
  thumbnailUrl: string
}
type ColorVariantsProps = {
  colors: ColorVariant[]
}
export function ColorVariants(props: ColorVariantsProps) {
  const [currentColorIndex, setCurrentColorIndex] = useState(0)
  const [showAllVariants, setShowAllVariants] = useState(false)
  const { colors } = props

  const currentColor = colors[currentColorIndex].color

  const onToggleRemainingVariants = () => setShowAllVariants((o) => !o)

  const colorVariantsToDisplay = showAllVariants ? colors : colors.slice(0, 5)
  return (
    <>
      <div>
        <Typography.Lead>
          Color:
          <Typography.Strong className="capitalize">{currentColor}</Typography.Strong>
        </Typography.Lead>

        <div className="grid grid-cols-5 gap-2">
          <ColorVariantsCardMapper
            colorVariants={colorVariantsToDisplay}
            currentColor={currentColor}
            setCurrentColorIndex={setCurrentColorIndex}
            onToggleRemainingVariants={onToggleRemainingVariants}
            showAllVariants={showAllVariants}
          />
        </div>
      </div>
    </>
  )
}

type ColorVariantsCardMapperProps = {
  colorVariants: ColorVariant[]
  currentColor: string
  setCurrentColorIndex: (index: number) => void
  onToggleRemainingVariants: () => void
  showAllVariants: boolean
}
function ColorVariantsCardMapper(props: ColorVariantsCardMapperProps) {
  const {
    colorVariants,
    currentColor,
    setCurrentColorIndex,
    onToggleRemainingVariants,
    showAllVariants,
  } = props

  return colorVariants.map((colorVariant, index) => {
    const isThePerfectFifth = (index + 1) % 5 === 0

    const remainingVariants = colorVariants.length - index

    if (isThePerfectFifth && !showAllVariants) {
      return (
        <ShowAllVariantsCard
          numberOfHiddenVariants={remainingVariants}
          onToggleRemainingVariants={onToggleRemainingVariants}
        />
      )
    }

    return (
      <ColorVariantCard
        key={colorVariant.color}
        {...colorVariant}
        index={index}
        currentColor={currentColor}
        setCurrentColorIndex={setCurrentColorIndex}
      />
    )
  })
}

type ColorVariantCardProps = ColorVariant & {
  currentColor: string
  setCurrentColorIndex: (index: number) => void
  index: number
}
function ColorVariantCard(props: ColorVariantCardProps) {
  const { color, thumbnailUrl, currentColor, setCurrentColorIndex, index } = props
  return (
    <Card className="border-2 border-transparent p-0 hover:border-black hover:dark:border-white cursor-pointer">
      <CardContent className="p-0">
        <figure>
          <img
            src={thumbnailUrl}
            alt={color}
            className={currentColor === color ? 'border-2 border-black' : ''}
            onClick={() => setCurrentColorIndex(index)}
          />
        </figure>
      </CardContent>
    </Card>
  )
}

type ShowAllVariantsCard = {
  numberOfHiddenVariants: number
  onToggleRemainingVariants: () => void
}
function ShowAllVariantsCard(props: ShowAllVariantsCard) {
  const { numberOfHiddenVariants, onToggleRemainingVariants } = props

  return (
    <Card
      onClick={onToggleRemainingVariants}
      className="border-2 border-transparent hover:border-black hover:dark:border-white cursor-pointer grid place-items-center"
    >
      <CardContent>
        <div className="text-2xl">+ {numberOfHiddenVariants}</div>
      </CardContent>
    </Card>
  )
}
