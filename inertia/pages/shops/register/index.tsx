import { useState, useCallback } from 'react'
import { useForm } from '@tanstack/react-form'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useRouter } from '@adonisjs/inertia/react'
import { XIcon } from 'lucide-react'
import { BrandingPanel } from './components/branding_panel'
import { ProgressStepper } from './components/progress_stepper'
import { StepAccount } from './components/step_account'
import { StepShopInfo } from './components/step_shop_info'
import { SuccessScreen } from './components/success_screen'
import { defaultOnboardingFormValues, type OnboardingForm, onboardingSchema } from './form'
import { Show } from '~/components/ui/show'

const steps = [
  { number: 1, label: 'Account' },
  { number: 2, label: 'Shop Information' },
]

type PageProps = {
  // After registering, the owner lands back here to see the success screen.
  success: boolean
  shopSlug: string | null
}

export default function ShopSignupPage({ success: isSuccess, shopSlug }: PageProps) {
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const shopRegisterForm = useForm({
    defaultValues: defaultOnboardingFormValues,
    validators: {
      onChange: onboardingSchema,
      onSubmit: onboardingSchema,
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true)
      router.visit(
        {
          route: 'api.auth.shop.shop_registration.store',
        },
        {
          method: 'post',
          data: value,
          onFinish: () => setIsSubmitting(false),
        }
      )
    },
  })

  const validateStep1 = useCallback(async (): Promise<boolean> => {
    const fields = ['fullName', 'email', 'phone', 'password', 'confirmPassword']

    let valid = true
    for (const name of fields) {
      await shopRegisterForm.validateField(name as keyof OnboardingForm, 'change')
    }

    for (const name of fields) {
      const meta = shopRegisterForm.getFieldMeta(name as keyof OnboardingForm)
      if (meta && meta.errors?.length > 0) {
        valid = false
      }
    }
    return valid
  }, [shopRegisterForm])

  const handleContinue = useCallback(async () => {
    const valid = await validateStep1()

    if (valid) {
      setStep(2)
    }
  }, [validateStep1])

  const handleSubmit = useCallback(async () => {
    await shopRegisterForm.handleSubmit()
  }, [shopRegisterForm])

  const handleBack = useCallback(() => {
    setStep(1)
  }, [])

  const goToDashboard = useCallback(() => {
    if (!shopSlug) {
      router.visit({ route: 'home' })
      return
    }

    router.visit({ route: 'ui.shops.shop_dashboard.create', routeParams: { shopSlug } })
  }, [router, shopSlug])

  const goToNewProduct = useCallback(() => {
    router.visit(shopSlug ? { href: `/shops/${shopSlug}/products/create` } : { route: 'home' })
  }, [router, shopSlug])

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
            <Show when={!isSuccess}>
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
            </Show>

            {/* progress stepper */}
            <Show when={!isSuccess}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.3 }}
              >
                <ProgressStepper steps={steps} currentStep={step} />
              </motion.div>
            </Show>

            {/* step content with animated transitions */}
            <AnimatePresence>
              <Show when={isSuccess} key="success">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                >
                  <SuccessScreen
                    onGoToDashboard={goToDashboard}
                    onAddFirstProduct={goToNewProduct}
                  />
                </motion.div>
              </Show>

              <Show when={!isSuccess} key="steps">
                <Show when={step === 1} key="step-1">
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <StepAccount
                      form={shopRegisterForm as any}
                      isSubmitting={isSubmitting}
                      onContinue={handleContinue}
                    />
                  </motion.div>
                </Show>

                <Show when={step === 2} key="step-2">
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <StepShopInfo
                      form={shopRegisterForm as any}
                      isSubmitting={isSubmitting}
                      onSubmit={handleSubmit}
                      onBack={handleBack}
                    />
                  </motion.div>
                </Show>
              </Show>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
