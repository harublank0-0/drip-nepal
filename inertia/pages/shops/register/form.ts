import { z } from 'zod'

/*
 * Case 1: User don't have existing user account
 * So we create user account with shop account
 */
export const onboardingSchema = z
  .object({
    // name of the owner (user)
    fullName: z.string().min(1, 'Full name is required'),

    // email of the owner
    email: z.email('Invalid email address'),

    // owner's phone number
    phone: z.string().min(7, 'Invalid phone number').max(15, 'Invalid phone number'),

    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),

    // this is the shop name
    shopName: z.string().min(1, 'Shop name is required'),

    // we will auto generate it for better ux
    // and validate or regenerate it on server side
    shopSlug: z.string().min(1, 'Shop URL is required'),

    // a shop can have multiple categories
    categories: z.string().array().min(1, 'Select at least one category'),

    // description of the shop
    description: z.string().optional(),

    // Shop location
    // additionally shop can have multiple location
    // for warehouse, primary shop, etc
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required'),
    district: z.string().min(1, 'District is required'),
    province: z.string().min(1, 'Province is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const defaultOnboardingFormValues: OnboardingForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  shopName: '',
  shopSlug: '',
  categories: [],
  description: '',
  address: '',
  city: '',
  district: '',
  province: '',
}
export type OnboardingForm = z.infer<typeof onboardingSchema>
