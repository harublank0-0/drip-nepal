import type { HttpContext } from '@adonisjs/core/http'
import { closedQuery, invalidParameter } from '#controllers/support/cursor'
import { activeDistricts, activeLocalLevels, activeProvinces } from '#modules/logistics/queries'
import { localLevelJson, placeJson } from '#transformers/logistics/location_transformer'
import { listDistrictsValidator, listLocalLevelsValidator } from '#validators/logistics/locations'

/*
 * The address cascades (docs/06 §13.2; 01 FR-IAM-012, AC-FR-IAM-012-1; 08
 * §4.3 `AddressForm`): Province → District → Local level, read from the
 * location reference data of docs/04 §21.4 (VX-10). Open to anyone, signed
 * in or not; the API limits middleware charges `catalog_ip` per client
 * network first (06 §9.1). Each list is bounded (7 provinces, at most 14
 * districts of a province, the local levels of one district), so it takes
 * no cursor and answers `{ data: [...] }` without `meta` (06 §6.2 "Bounded
 * lists"). Only
 * active units are offered. A query parameter outside the closed list, or a
 * code that is missing, repeated or not of its shape, is 400
 * `INVALID_QUERY_PARAMETER` (06 §6.3); a well-formed code that names no
 * active unit answers an empty list. Routes in start/routes/api_v1/public.ts,
 * named by their operationIds.
 */
export default class LocationsController {
  // listProvinces: the seven provinces, by code.
  async listProvinces(ctx: HttpContext) {
    closedQuery(ctx, [])
    const provinces = await activeProvinces()
    return { data: provinces.map(placeJson) }
  }

  // listDistricts: the districts of `province`, by name.
  async listDistricts(ctx: HttpContext) {
    closedQuery(ctx, ['province'])
    const [error, input] = await ctx.request.tryValidateUsing(listDistrictsValidator)
    if (error) throw invalidParameter('province', 'Send one province code, 1 to 7.')
    const districts = await activeDistricts(input.province)
    return { data: districts.map(placeJson) }
  }

  // listLocalLevels: the local levels of `district`, by name, with their ward counts.
  async listLocalLevels(ctx: HttpContext) {
    closedQuery(ctx, ['district'])
    const [error, input] = await ctx.request.tryValidateUsing(listLocalLevelsValidator)
    if (error) throw invalidParameter('district', 'Send one three-digit district code.')
    const localLevels = await activeLocalLevels(input.district)
    return { data: localLevels.map(localLevelJson) }
  }
}
