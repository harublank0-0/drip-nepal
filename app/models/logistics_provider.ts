import { LogisticsProviderSchema } from '#database/schema'

/*
 * docs/04a §9.8 (logistics, OD-56). The accounts that reference it are in
 * baseline file 5; `capabilities` is read through a typed parser
 * (docs/04 §2.11).
 */
export default class LogisticsProvider extends LogisticsProviderSchema {}
