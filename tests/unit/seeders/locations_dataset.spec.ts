import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import { CsvError, parseCsv } from '#database/support/csv'
import {
  checkLocations,
  LOCATIONS_FILE,
  LocationsDatasetError,
  readLocations,
  TYPE_LABELS,
  type LocationRow,
} from '#database/seeders/reference/01_locations_seeder'

/*
 * T-SHOP-117 (docs/10 §6.2, docs/04 §21.4): the committed locations dataset
 * passes every check of the locations seeder, and a dataset that breaks one
 * is refused before anything is written. No database: the functional suite
 * checks the seeded tables (tests/functional/seeders/locations_seeder.spec.ts).
 */

type Mutation = { name: string; change: (rows: LocationRow[]) => LocationRow[]; error: RegExp }

const at = (rows: LocationRow[], code: string) => {
  const row = rows.find((candidate) => candidate.code === code)
  if (!row) throw new Error(`no row ${code} in the dataset`)
  return row
}

const MUTATIONS: Mutation[] = [
  {
    name: 'a local level is missing',
    change: (rows) => rows.filter((row) => row.code !== '10101'),
    error: /752 local levels, expected 753/,
  },
  {
    name: 'a code is named twice',
    change: (rows) => [...rows, { ...at(rows, '30608') }],
    error: /30608 is listed twice/,
  },
  {
    name: 'a district has two names',
    change: (rows) => ((at(rows, '30601').districtNameEn = 'Elsewhere'), rows),
    error: /district 306 has two names/,
  },
  {
    name: 'a province has two names',
    change: (rows) => ((at(rows, '30601').provinceNameNe = 'अन्यत्र'), rows),
    error: /province 3 has two names/,
  },
  {
    name: 'a code sits outside its district',
    change: (rows) => ((at(rows, '30608').districtCode = '307'), rows),
    error: /30608 is not in district 307/,
  },
  {
    name: 'a district sits outside its province',
    change: (rows) => {
      for (const row of rows) if (row.districtCode === '306') row.provinceCode = '4'
      return rows
    },
    error: /district 306 is not in province 4/,
  },
  {
    name: 'a type is outside the vocabulary',
    change: (rows) => ((at(rows, '10101').type = 'village' as LocationRow['type']), rows),
    error: /10101 has the unknown type "village"/,
  },
  {
    name: 'a ward count is above 40',
    change: (rows) => ((at(rows, '40504').wardCount = 41), rows),
    error: /40504 has 41 wards/,
  },
  {
    name: 'a ward count is not a whole number',
    change: (rows) => ((at(rows, '40504').wardCount = Number.NaN), rows),
    error: /40504 has NaN wards/,
  },
  {
    name: 'the wards do not add up',
    change: (rows) => ((at(rows, '10101').wardCount = 8), rows),
    error: /6744 wards, expected 6743/,
  },
  {
    name: 'a type count is off',
    change: (rows) => ((at(rows, '10101').type = 'municipality'), rows),
    error: /277 of type municipality, expected 276/,
  },
  {
    name: 'a name is not NFC',
    change: (rows) => ((at(rows, '10101').nameEn = 'Phaktanlungé Rural Municipality'), rows),
    error: /10101 has a name that is empty, padded or not NFC/,
  },
  {
    name: 'a name is empty',
    change: (rows) => ((at(rows, '10101').nameNe = ''), rows),
    error: /10101 has a name that is empty, padded or not NFC/,
  },
  {
    name: 'a name is padded',
    change: (rows) => ((at(rows, '10101').nameEn = ' Phaktanlung Rural Municipality'), rows),
    error: /10101 has a name that is empty, padded or not NFC/,
  },
  {
    name: 'a province name is empty',
    change: (rows) => {
      for (const row of rows) if (row.provinceCode === '7') row.provinceNameNe = ''
      return rows
    },
    error: /has a district or province name that is empty, padded or not NFC/,
  },
  {
    name: 'two local levels of one district share an English name',
    change: (rows) => ((at(rows, '10102').nameEn = 'Phaktanlung Rural Municipality'), rows),
    error: /10102: "Phaktanlung Rural Municipality" is already a local level of district 101/,
  },
  {
    name: 'an English name does not end with its type',
    change: (rows) => ((at(rows, '10101').nameEn = 'Phaktanlung Municipality'), rows),
    error: /10101: "Phaktanlung Municipality" does not end with "Rural Municipality"/,
  },
]

test.group('T-SHOP-117 the locations dataset', (group) => {
  let committed: LocationRow[] = []
  group.setup(async () => {
    committed = await readLocations()
  })
  const fresh = () => committed.map((row) => ({ ...row }))

  test('T-SHOP-117 the committed dataset passes every check and holds the documented examples', ({
    assert,
  }) => {
    const summary = checkLocations(fresh())
    assert.deepEqual(summary, {
      provinces: 7,
      districts: 77,
      localLevels: 753,
      wards: 6743,
      byType: { metropolitan: 6, sub_metropolitan: 11, municipality: 276, rural_municipality: 460 },
    })
    const kathmandu = at(committed, '30608')
    assert.include(kathmandu, {
      provinceCode: '3',
      provinceNameEn: 'Bagmati',
      districtCode: '306',
      districtNameEn: 'Kathmandu',
      nameEn: 'Kathmandu Metropolitan City',
      type: 'metropolitan',
      wardCount: 32,
    })
    assert.include(at(committed, '40504'), { nameEn: 'Pokhara Metropolitan City', wardCount: 33 })
    assert.include(at(committed, '10101'), { districtCode: '101', wardCount: 7 })
    // The split districts of docs/04 §21.4, each in its own province.
    const district = (code: string) => committed.find((row) => row.districtCode === code)
    assert.include(district('408'), { provinceCode: '4', districtNameEn: 'Nawalparasi (East)' })
    assert.include(district('507'), { provinceCode: '5', districtNameEn: 'Nawalparasi (West)' })
    assert.include(district('501'), { provinceCode: '5', districtNameEn: 'Rukum (East)' })
    assert.include(district('608'), { provinceCode: '6', districtNameEn: 'Rukum (West)' })
  })

  test('T-SHOP-117 every correction in locations_overrides.csv is in the committed dataset', async ({
    assert,
  }) => {
    // The CSV is generated from the corrections (docs/04 §21.4 step 4); this
    // fails when one is edited without regenerating, or the CSV by hand.
    const overrides = parseCsv(
      await readFile(new URL('./locations_overrides.csv', LOCATIONS_FILE), 'utf8')
    )
    assert.lengthOf(overrides, 45)
    for (const override of overrides) {
      const row = at(committed, override.code)
      assert.equal(row.nameEn, `${override.name_en} ${TYPE_LABELS[row.type]}`, override.code)
      if (override.name_ne)
        assert.equal(row.nameNe, override.name_ne.normalize('NFC'), override.code)
      assert.oneOf(override.source, ['survey_department', 'transliterated'], override.code)
      assert.isNotEmpty(override.note, override.code)
    }
  })

  test('T-SHOP-117 a dataset where {name} is refused')
    .with(MUTATIONS)
    .run(({ assert }, mutation) => {
      const error = (() => {
        try {
          checkLocations(mutation.change(fresh()))
          return null
        } catch (caught) {
          return caught
        }
      })()
      assert.instanceOf(error, LocationsDatasetError)
      assert.match((error as Error).message, mutation.error)
    })
})

test.group('T-SHOP-117 the reference-data CSV reader', () => {
  test('T-SHOP-117 skips the comment lines before the header and reads quoted fields', ({
    assert,
  }) => {
    const text = '# source, date\n# more\ncode,name\n1,"Koshi, ""east"""\r\n2,Madhesh\n'
    assert.deepEqual(parseCsv(text), [
      { code: '1', name: 'Koshi, "east"' },
      { code: '2', name: 'Madhesh' },
    ])
  })

  test('T-SHOP-117 refuses a row with the wrong number of fields or an open quote', ({
    assert,
  }) => {
    assert.throws(() => parseCsv('code,name\n1\n'), CsvError, /line 2 has 1 field\(s\), expected 2/)
    assert.throws(() => parseCsv('code,name\n1,"Koshi\n'), CsvError, /unterminated quote/)
    assert.throws(() => parseCsv('code,code\n1,2\n'), CsvError, /duplicate column "code"/)
    assert.throws(() => parseCsv('# only a comment\n'), CsvError, /no header/)
  })
})
