/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  home: typeof routes['home']
  newAccount: {
    create: typeof routes['new_account.create']
    store: typeof routes['new_account.store']
  }
  session: {
    create: typeof routes['session.create']
    store: typeof routes['session.store']
    destroy: typeof routes['session.destroy']
  }
  men: typeof routes['men']
  women: typeof routes['women']
  categories: {
    show: typeof routes['categories.show']
  }
  menProductDetail: typeof routes['men_product_detail']
  designSystem: typeof routes['design-system']
}
