import { useState, useCallback, useEffect } from 'react'
import { useForm } from '@tanstack/react-form'
import { AnimatePresence, motion } from 'framer-motion'
import { router } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { z } from 'zod'
import { XIcon } from 'lucide-react'
import { BrandingPanel } from '~/components/onboarding/branding_panel'
import { ProgressStepper } from '~/components/onboarding/progress_stepper'
import { StepAccount } from '~/components/onboarding/step_account'
import { StepShopInfo } from '~/components/onboarding/step_shop_info'
import { SuccessScreen } from '~/components/onboarding/success_screen'
import { routes } from '@generated/registry'

const steps = [
  { number: 1, label: 'Account' },
  { number: 2, label: 'Shop Information' },
]

const onboardingSchema = z
  .object({
    fullName: z.string().min(1, 'Full name is required'),
    email: z.email('Invalid email address'),
    phone: z.string().min(7, 'Invalid phone number'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    shopName: z.string().min(1, 'Shop name is required'),
    shopSlug: z.string().min(1, 'Shop URL is required'),
    category: z.string().min(1, 'Please select a category'),
    description: z.string().optional(),
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required'),
    district: z.string().min(1, 'District is required'),
    province: z.string().min(1, 'Province is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type OnboardingForm = z.infer<typeof onboardingSchema>

const defaultValues: OnboardingForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  shopName: '',
  shopSlug: '',
  category: '',
  description: '',
  address: '',
  city: '',
  district: '',
  province: '',
}

function getInitialSuccess(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('success') === '1'
}

export default function ShopSignupPage() {
  const [step, setStep] = useState(1)
  const [isSuccess] = useState(getInitialSuccess)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isSuccess) {
      window.history.replaceState({}, '', '/shops/signup')
    }
  }, [isSuccess])

  const form = useForm({
    defaultValues,
    validators: {
      onBlur: onboardingSchema,
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true)
      router.post(routes['shops.shop_registrations.create'].pattern, value)
    },
  })

  const validateStep1 = useCallback(async (): Promise<boolean> => {
    const fields = ['fullName', 'email', 'phone', 'password', 'confirmPassword']
    let valid = true
    for (const name of fields) {
      await form.validateField(name as keyof OnboardingForm, 'change')
    }
    for (const name of fields) {
      const meta = form.getFieldMeta(name as keyof OnboardingForm)
      if (meta && meta.errors?.length > 0) {
        valid = false
      }
    }
    return valid
  }, [form])

  const handleContinue = useCallback(async () => {
    const valid = await validateStep1()
    if (valid) {
      setStep(2)
    }
  }, [validateStep1])

  const handleSubmit = useCallback(async () => {
    await form.handleSubmit()
  }, [form])

  const handleBack = useCallback(() => {
    setStep(1)
  }, [])

  return (
    <div className="flex min-h-screen w-screen flex-col lg:flex-row">
      {/* left branding panel */}
      <BrandingPanel />

      {/* right panel */}
      <div className="flex flex-1 flex-col">
        {/* mobile header + cancel */}
        <div className="flex items-center justify-between px-4 pt-4 lg:hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm font-heading font-bold text-primary">Drip Nepal</span>
          </div>
          <Link
            href="/"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cancel and go home"
          >
            <XIcon className="size-4" />
          </Link>
        </div>

        {/* desktop cancel button */}
        <div className="hidden items-center justify-end px-8 pt-6 lg:flex">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <XIcon className="size-4" />
            Cancel
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-8 pt-4 lg:px-8 lg:pb-12">
          <div className="w-full max-w-lg space-y-8">
            {/* header */}
            {!isSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-1.5"
              >
                <h1 className="text-2xl font-heading font-bold tracking-tight lg:text-3xl">
                  Create Your Shop
                </h1>
                <p className="text-sm text-muted-foreground">Start selling on Drip Nepal today.</p>
              </motion.div>
            )}

            {/* progress stepper */}
            {!isSuccess && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.3 }}
              >
                <ProgressStepper steps={steps} currentStep={step} />
              </motion.div>
            )}

            {/* step content with animated transitions */}
            <AnimatePresence mode="wait">
              {isSuccess ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                >
                  <SuccessScreen
                    onGoToDashboard={() => router.visit('/')}
                    onAddFirstProduct={() => router.visit('/')}
                  />
                </motion.div>
              ) : step === 1 ? (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <StepAccount
                    form={form as any}
                    isSubmitting={isSubmitting}
                    onContinue={handleContinue}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <StepShopInfo
                    form={form as any}
                    isSubmitting={isSubmitting}
                    onSubmit={handleSubmit}
                    onBack={handleBack}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
