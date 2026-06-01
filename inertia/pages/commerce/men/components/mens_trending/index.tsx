import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/components/ui/carousel'
import AutoScroll from 'embla-carousel-auto-scroll'
import WheelGesture from 'embla-carousel-wheel-gestures'
import { DripProductCard } from '~/components/commerce/drip_product_card'

export function MensTrending() {
  return (
    <>
      <div className="container mx-auto py-12">
        <Carousel
          plugins={[
            WheelGesture({
              active: true,
            }),
            AutoScroll({
              active: false,
            }),
          ]}
          // setApi={setCarouselApi}
          opts={{
            loop: true,
            containScroll: 'trimSnaps',
            dragFree: true,
            slidesToScroll: 5,
          }}
        >
          <CarouselContent className="">
            {products.map((product) => (
              <CarouselItem className="md:basis-1/5" key={product.name}>
                <DripProductCard {...product} />
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious size="lg" className="cursor-pointer" />
          <CarouselNext size="lg" className="cursor-pointer" />
        </Carousel>
      </div>
    </>
  )
}

const products = [
  {
    name: 'Vintage Denim Jacket',
    description:
      'A classic denim jacket with a vintage wash and durable stitching. Perfect for everyday streetwear.',
    price: 180.0,
    image:
      'https://images.unsplash.com/photo-1649937408746-4d2f603f91c8?auto=format&fit=crop&q=80&w=1226',
    isBestSeller: true,
    isFavorited: false,
  },
  {
    name: 'Oversized Black Hoodie',
    description:
      'Heavyweight oversized hoodie with a soft brushed interior and minimalist streetwear silhouette.',
    price: 95.0,
    image:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: true,
    isFavorited: true,
  },
  {
    name: 'Minimal White Sneakers',
    description:
      'Clean everyday sneakers designed with premium leather and a timeless minimalist aesthetic.',
    price: 140.0,
    image:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: false,
    isFavorited: false,
  },
  {
    name: 'Relaxed Cargo Pants',
    description: 'Relaxed-fit cargo pants featuring utility pockets and modern urban tailoring.',
    price: 110.0,
    image:
      'https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: false,
    isFavorited: true,
  },
  {
    name: 'Essential Beige Tee',
    description: 'Soft cotton oversized tee with dropped shoulders and premium everyday comfort.',
    price: 45.0,
    image:
      'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: true,
    isFavorited: false,
  },
  {
    name: 'Monochrome Bomber Jacket',
    description:
      'Lightweight bomber jacket with clean panel detailing and contemporary street styling.',
    price: 160.0,
    image:
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: false,
    isFavorited: false,
  },
  {
    name: 'Urban Knit Sweater',
    description: 'Textured knit sweater with an oversized fit designed for layered winter outfits.',
    price: 88.0,
    image:
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: false,
    isFavorited: true,
  },
  {
    name: 'Classic Leather Boots',
    description:
      'Premium leather boots with durable soles and timeless Kathmandu streetwear energy.',
    price: 220.0,
    image:
      'https://images.unsplash.com/photo-1608256246200-53e8b47b2f80?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: true,
    isFavorited: false,
  },
  {
    name: 'Minimal Crossbody Bag',
    description:
      'Compact crossbody bag with sleek storage compartments and a modern utility aesthetic.',
    price: 70.0,
    image:
      'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: false,
    isFavorited: false,
  },
  {
    name: 'Streetwear Flannel Shirt',
    description:
      'Relaxed flannel shirt with soft fabric and layered styling for modern street fashion.',
    price: 75.0,
    image:
      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=1200',
    isBestSeller: true,
    isFavorited: true,
  },
]
