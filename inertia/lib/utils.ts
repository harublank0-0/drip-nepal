import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import slugify from 'slugify'

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
  if (Number.isNaN(listAmount) || Number.isNaN(sellingPrice)) return 0

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
  if (Number.isNaN(listAmount) || Number.isNaN(sellingPrice)) return 0

  return Math.abs(listAmount - sellingPrice)
}

/**
 * just a simple function that returns true if array is empty
 */
export const isArrayEmpty = (array: unknown[]) => {
  if (!Array.isArray(array)) throw new Error('Array is not an array')
  return array.length === 0
}

/**
 * Just a simple function to check if the object is empty
 */
export const isObjectEmpty = (obj: Record<string, unknown>) => {
  return Object.keys(obj).length === 0
}

/*
 * a util to check if the server has sent validation error
 */
export const hasValidationErrors = (errors: Record<string, string>) =>
  Object.keys(errors).length > 0

/*
 * base slugify with default settings for slugifying labels
 */
export const dripSlugify = (label: string) =>
  slugify(label, {
    lower: true,
    strict: true,
    trim: true,
  })
