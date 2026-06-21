import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check if the code is running in the browser
 */
export const isBrowser = typeof window !== 'undefined'

/**
 * get the discount percentage
 * from the list amount and discount amount
 * list amount is not the vendor cost price (i.e the price at which vendor
 * bought)
 * it's the price at which vendor is selling
 */
export const getDiscountPercentage = (listAmount: number, sellingPrice: number) => {
  if (isNaN(listAmount) || isNaN(sellingPrice)) return 0

  return Math.round(((listAmount - sellingPrice) / listAmount) * 100)
}

/**
 * get the discounted amount
 * from the list amount and discount amount
 * list amount is not the vendor cost price (i.e the price at which vendor
 * bought)
 * it's the price at which vendor is selling
 */
export const getDiscountedPrice = (listAmount: number, sellingPrice: number) => {
  if (isNaN(listAmount) || isNaN(sellingPrice)) return 0

  return Math.abs(listAmount - sellingPrice)
}
