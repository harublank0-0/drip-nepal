import { PlatformSettingSchema } from '#database/schema'

/*
 * docs/04a §15.1 (platform). `platform` imports no other module
 * (docs/09 §2.2), so `updated_by` has no relation here.
 */
export default class PlatformSetting extends PlatformSettingSchema {}
