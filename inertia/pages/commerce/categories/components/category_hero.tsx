type CategoryHeroProps = {
  title: string
  description: string
  totalProducts: number
  heroImage: string
}

export function CategoryHero({ title, description, totalProducts, heroImage }: CategoryHeroProps) {
  return (
    <section className="relative h-[40vh] md:h-[55vh] overflow-hidden rounded-xl md:rounded-2xl mb-6 md:mb-10">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12">
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-heading font-bold text-white mb-2 md:mb-3 tracking-tight">
          {title}
        </h1>
        <p className="text-sm md:text-base text-white/80 max-w-xl mb-2 md:mb-3 leading-relaxed">
          {description}
        </p>
        <p className="text-xs md:text-sm text-white/60">
          {totalProducts.toLocaleString()} products
        </p>
      </div>
    </section>
  )
}
