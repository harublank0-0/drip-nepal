import { ScrollTextIcon } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion'
import { SectionCard } from './shared/section_card'
import { AutoSaveIndicator } from './shared/auto_save_indicator'
import { PolicyEditor } from './shared/policy_editor'
import { policyKeys, type PolicyKey, type StorePolicies } from '../types'

type PoliciesSectionProps = {
  value: StorePolicies
  onChange: (next: StorePolicies) => void
}

const policyMeta: Record<PolicyKey, string> = {
  privacyPolicy: 'Privacy Policy',
  refundPolicy: 'Refund Policy',
  returnPolicy: 'Return Policy',
  shippingPolicy: 'Shipping Policy',
  termsAndConditions: 'Terms & Conditions',
}

export function PoliciesSection({ value, onChange }: PoliciesSectionProps) {
  const setPolicy = (key: PolicyKey, next: string) => onChange({ ...value, [key]: next })

  return (
    <SectionCard
      id="policies"
      icon={ScrollTextIcon}
      title="Store Policies"
      description="Legal and operational policies shown to customers at checkout and on your storefront."
      action={<AutoSaveIndicator status="idle" />}
      noPadding
    >
      <Accordion type="multiple" defaultValue={['refundPolicy']} className="px-4">
        {policyKeys.map((key) => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                {policyMeta[key]}
                <span className="text-xs font-normal text-muted-foreground">
                  {value[key].length.toLocaleString()} chars
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <PolicyEditor value={value[key]} onChange={(next) => setPolicy(key, next)} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </SectionCard>
  )
}
