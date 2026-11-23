import vine from '@vinejs/vine'

/*
 * The query of the address cascades (docs/06 §13.2 `listDistricts`,
 * `listLocalLevels`): one required code of the shape of docs/04a §9.1 or
 * §9.2. The controller refuses any other query parameter first, and answers
 * a refusal here with 400 `INVALID_QUERY_PARAMETER`, not 422 (06 §6.3).
 */
export const listDistrictsValidator = vine.create({
  province: vine.string().regex(/^[1-7]$/),
})

export const listLocalLevelsValidator = vine.create({
  district: vine.string().regex(/^[1-7]\d{2}$/),
})
