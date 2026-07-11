import { ShopCategories } from '@shared/constants/shop_categories'

export const businessCategoryOptions = ShopCategories.map((category) => ({
  label: category.label,
  value: category.slug,
}))

export const countryOptions = [
  { label: 'Nepal', value: 'Nepal' },
  { label: 'India', value: 'India' },
  { label: 'Bangladesh', value: 'Bangladesh' },
  { label: 'United States', value: 'United States' },
  { label: 'United Kingdom', value: 'United Kingdom' },
  { label: 'Australia', value: 'Australia' },
  { label: 'United Arab Emirates', value: 'United Arab Emirates' },
]

export const timezoneOptions = [
  { label: '(GMT+5:45) Kathmandu', value: 'Asia/Kathmandu' },
  { label: '(GMT+5:30) New Delhi', value: 'Asia/Kolkata' },
  { label: '(GMT+6:00) Dhaka', value: 'Asia/Dhaka' },
  { label: '(GMT+0:00) London', value: 'Europe/London' },
  { label: '(GMT-5:00) New York', value: 'America/New_York' },
  { label: '(GMT+4:00) Dubai', value: 'Asia/Dubai' },
]

export const currencyOptions = [
  { label: 'NPR — Nepali Rupee', value: 'NPR' },
  { label: 'INR — Indian Rupee', value: 'INR' },
  { label: 'USD — US Dollar', value: 'USD' },
  { label: 'EUR — Euro', value: 'EUR' },
  { label: 'GBP — British Pound', value: 'GBP' },
]

export const languageOptions = [
  { label: 'English', value: 'en' },
  { label: 'नेपाली (Nepali)', value: 'ne' },
  { label: 'हिन्दी (Hindi)', value: 'hi' },
]

export const processingTimeOptions = [
  { label: 'Same day', value: '0-1' },
  { label: '1-2 business days', value: '1-2' },
  { label: '2-4 business days', value: '2-4' },
  { label: '4-7 business days', value: '4-7' },
]

export const courierOptions = [
  { label: 'Pathao Courier', value: 'pathao' },
  { label: 'Nepal Can Move', value: 'ncm' },
  { label: 'DHL Express', value: 'dhl' },
  { label: 'FedEx', value: 'fedex' },
  { label: 'Aramex', value: 'aramex' },
]

export const fontPairingOptions = [
  { label: 'Geist + Lora (Modern serif headings)', value: 'geist-lora' },
  { label: 'Geist + Geist (All sans-serif)', value: 'geist-geist' },
  { label: 'Noto Sans + Lora (Warm & readable)', value: 'noto-lora' },
]
