import type { LocalLevelPlace, Place } from '#modules/logistics/queries'

/*
 * The location reference data as the address cascades answer it (docs/06
 * §13.2 `listProvinces`, `listDistricts`, `listLocalLevels`) and as the
 * `/account/addresses` page receives the provinces (docs/08 §2.4): the code
 * and the English name, and a local level's ward count, so the form can
 * bound the ward (AC-FR-IAM-012-2). The data is VX-10 [Verify-external]:
 * it is offered as choices and never described as official.
 */
export function placeJson(place: Place) {
  return { code: place.code, name: place.name }
}

export function localLevelJson(place: LocalLevelPlace) {
  return { code: place.code, name: place.name, ward_count: place.wardCount }
}
