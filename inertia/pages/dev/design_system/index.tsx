import { SYSTEM_COLORS } from './colors'
import { ThemeSection } from './theme_section'
import { ColorCard } from './color_card'
import { DesignButtons } from './design_buttons'
import { DesignCard } from './design_card'

export default function DesignSystem() {
  return (
    <div className="space-y-12 p-8">
      <ThemeSection title="Light Theme" theme="light">
        {SYSTEM_COLORS.map((color) => (
          <ColorCard key={color.name} {...color} />
        ))}

        <DesignButtons />
        <DesignCard />
      </ThemeSection>

      <ThemeSection title="Dark Theme" theme="dark">
        {SYSTEM_COLORS.map((color) => (
          <ColorCard key={color.name} {...color} />
        ))}

        <DesignButtons />
        <DesignCard />
      </ThemeSection>
    </div>
  )
}
