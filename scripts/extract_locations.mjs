// Builds database/seeders/reference/data/locations.csv (docs/04 §21.4) from two
// downloaded government lists and the hand-checked corrections file. Node
// built-ins only; it reads local files and fetches nothing.
//
//   node scripts/extract_locations.mjs --post <postal_code_page.html> --cbs <cbs_local_units.csv> \
//     --downloaded <YYYY-MM-DD> [--overrides <csv>] [--out <csv>]
//
// --post: Nepal Post's "नेपालको पोष्टल कोड" page, saved as HTML. It gives every
//   local level's 5-digit code, its district, its Nepali name (whose last word
//   is the type) and its ward range ("1010101 देखि 07").
// --cbs: the Central Bureau of Statistics' local-unit list from Open Data Nepal
//   (columns S.N., District, Local unit, स्थानीय तह, Code). It gives the English
//   names of local levels and districts under the same codes.
// --overrides: the corrections file (default next to the output). Its rows
//   replace an English place name, or a Nepali name, for one code.
//
// The output is fully determined by these inputs. The script refuses to write
// unless every count of docs/04 §21.4 holds and every override is used.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const DATA = 'database/seeders/reference/data'
const { values: args } = parseArgs({
  options: {
    post: { type: 'string' },
    cbs: { type: 'string' },
    downloaded: { type: 'string' },
    overrides: { type: 'string', default: `${DATA}/locations_overrides.csv` },
    out: { type: 'string', default: `${DATA}/locations.csv` },
  },
})
if (!args.post || !args.cbs || !/^\d{4}-\d{2}-\d{2}$/.test(args.downloaded ?? '')) {
  console.error(
    'usage: --post <html> --cbs <csv> --downloaded <YYYY-MM-DD> [--overrides <csv>] [--out <csv>]'
  )
  process.exit(2)
}

const POST_URL = 'https://morang.nepalpost.gov.np/pages/postal-code-of-nepal-1297813915'
const CBS_URL =
  'https://opendatanepal.com/dataset/geographical-codes-for-states-districts-and-local-bodies'

// docs/04a §9.1 names the provinces; the Nepali names are the provinces' own.
const PROVINCES = {
  1: ['Koshi', 'कोशी'],
  2: ['Madhesh', 'मधेश'],
  3: ['Bagmati', 'बागमती'],
  4: ['Gandaki', 'गण्डकी'],
  5: ['Lumbini', 'लुम्बिनी'],
  6: ['Karnali', 'कर्णाली'],
  7: ['Sudurpashchim', 'सुदूरपश्चिम'],
}

// The last word of a Nepali local-level name gives its type. The Nepal Post
// text misspells a few of them, so the prefix decides and the word is then
// rewritten in its standard spelling. Order matters: उपमहानगर before महानगर.
const TYPES = [
  {
    prefix: 'उपमहानगर',
    type: 'sub_metropolitan',
    word: 'उपमहानगरपालिका',
    en: 'Sub-Metropolitan City',
  },
  { prefix: 'महानगर', type: 'metropolitan', word: 'महानगरपालिका', en: 'Metropolitan City' },
  { prefix: 'गाउ', type: 'rural_municipality', word: 'गाउँपालिका', en: 'Rural Municipality' },
  { prefix: 'नगर', type: 'municipality', word: 'नगरपालिका', en: 'Municipality' },
]

const EXPECTED = {
  localLevels: 753,
  wards: 6743,
  localLevelsByProvince: [137, 136, 119, 85, 109, 79, 88],
  districtsByProvince: [14, 8, 13, 11, 12, 10, 9],
  byType: { metropolitan: 6, sub_metropolitan: 11, municipality: 276, rural_municipality: 460 },
}

const problems = []
const fail = (message) => problems.push(message)
const nfc = (text) => text.normalize('NFC')
const squash = (text) => text.replace(/\s+/g, ' ').trim()
const DEVANAGARI_DIGITS = '०१२३४५६७८९'
const asciiDigits = (text) => text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
// Names may hold brackets ("ठोरी (सुवर्णपुर)") and full stops ("के.आई.सिं.", "K.I. Singh").
// Anything else, such as a zero-width joiner or a Latin letter in a Nepali name, is refused.
const NEPALI_NAME = /^[ऀ-ॿ][ऀ-ॿ .()-]*[ऀ-ॿ.)]$/
const ENGLISH_NAME = /^[A-Z][A-Za-z .()-]*[A-Za-z.)]$/

/** RFC 4180 rows; lines starting with # before the header are comments. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') ((field += '"'), i++)
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === ',') (row.push(field), (field = ''))
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      ;(row.push(field), rows.push(row), (row = []), (field = ''))
    } else field += ch
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row))
  const lines = rows.filter((r) => !(r.length === 1 && r[0] === ''))
  while (lines.length && lines[0][0].startsWith('#')) lines.shift()
  const [header, ...body] = lines
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const csvField = (value) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
const cellText = (html) => squash(decodeEntities(html.replace(/<[^>]+>/g, ' ')))

// 1. Nepal Post: code, district, Nepali name, wards.
const page = readFileSync(args.post, 'utf8')
const tables = page.match(/<table[\s\S]*?<\/table>/g) ?? []
if (tables.length !== 1) fail(`expected one table in the Nepal Post page, found ${tables.length}`)
const post = new Map()
for (const tr of (tables[0] ?? '').match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
  const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => cellText(m[1]))
  if (cells.length < 5 || cells[4] === '' || cells[0] === 'क्र. सं.') continue // header and district headings
  const range = asciiDigits(cells[4]).match(/^(\d{5})(\d{2})\s*देखि\s*(\d{1,2})$/)
  if (!range) {
    fail(`unreadable ward range "${cells[4]}" in row ${cells[0]}`)
    continue
  }
  const [, code, firstWard, lastWard] = range
  if (firstWard !== '01') fail(`${code}: wards start at ${firstWard}, not 01`)
  if (post.has(code)) fail(`${code}: listed twice by Nepal Post`)
  post.set(code, {
    districtNe: nfc(cells[1]),
    nameNe: nfc(cells[3]),
    wardCount: Number(lastWard),
  })
}

// 2. CBS: English names under the same codes.
const cbs = new Map()
for (const row of parseCsv(readFileSync(args.cbs, 'utf8'))) {
  const code = row['Code']
  if (cbs.has(code)) fail(`${code}: listed twice by CBS`)
  cbs.set(code, { districtEn: squash(row['District']), nameEn: squash(row['Local unit']) })
}

// 3. Corrections.
const overrides = new Map(parseCsv(readFileSync(args.overrides, 'utf8')).map((r) => [r.code, r]))
const usedOverrides = new Set()

for (const code of post.keys())
  if (!cbs.has(code)) fail(`${code}: in Nepal Post's list, not in CBS's`)
for (const code of cbs.keys())
  if (!post.has(code)) fail(`${code}: in CBS's list, not in Nepal Post's`)
for (const code of overrides.keys())
  if (!post.has(code)) fail(`override ${code}: no such local level`)

/** "Nawalparasi East" → "Nawalparasi (East)", as docs/04 §21.4 writes the split districts. */
const districtEnglish = (name) => name.replace(/^(Nawalparasi|Rukum) (East|West)$/, '$1 ($2)')
/** The CBS name without its type words, whatever their spelling. */
const placeOf = (name) =>
  squash(
    name.replace(
      /\s*(Sub-?Metropolit\w* City|Metropolit\w* City|Rural Municipa\w*|Municipa\w*|Gaun ?pa\w*)$/i,
      ''
    )
  )

const rows = []
const districts = new Map()
for (const code of [...post.keys()].sort()) {
  const p = post.get(code)
  const c = cbs.get(code)
  if (!c) continue
  const override = overrides.get(code)
  if (override) usedOverrides.add(code)

  let nameNe = override?.name_ne ? nfc(override.name_ne) : p.nameNe
  const words = nameNe.split(' ')
  const kind = TYPES.find((t) => words.at(-1).startsWith(t.prefix))
  if (!kind) {
    fail(`${code}: no type in "${nameNe}"`)
    continue
  }
  nameNe = [...words.slice(0, -1), kind.word].join(' ')
  const nameEn = `${override?.name_en ? squash(override.name_en) : placeOf(c.nameEn)} ${kind.en}`
  if (!NEPALI_NAME.test(nameNe)) fail(`${code}: unexpected characters in "${nameNe}"`)
  if (!ENGLISH_NAME.test(nameEn)) fail(`${code}: unexpected characters in "${nameEn}"`)

  const districtCode = code.slice(0, 3)
  const district = { nameEn: districtEnglish(c.districtEn), nameNe: p.districtNe }
  const known = districts.get(districtCode)
  if (!known) districts.set(districtCode, district)
  else if (known.nameEn !== district.nameEn || known.nameNe !== district.nameNe)
    fail(
      `${code}: district ${districtCode} named both ${JSON.stringify(known)} and ${JSON.stringify(district)}`
    )
  if (!NEPALI_NAME.test(district.nameNe))
    fail(`${districtCode}: unexpected characters in "${district.nameNe}"`)
  if (!ENGLISH_NAME.test(district.nameEn))
    fail(`${districtCode}: unexpected characters in "${district.nameEn}"`)

  const provinceCode = code.slice(0, 1)
  const [provinceEn, provinceNe] = PROVINCES[provinceCode] ?? []
  if (!provinceEn) fail(`${code}: no province ${provinceCode}`)
  if (p.wardCount < 1 || p.wardCount > 40) fail(`${code}: ${p.wardCount} wards is outside 1 to 40`)
  rows.push([
    provinceCode,
    provinceEn,
    provinceNe,
    districtCode,
    district.nameEn,
    district.nameNe,
    code,
    nameEn,
    nameNe,
    kind.type,
    String(p.wardCount),
  ])
}

for (const code of overrides.keys())
  if (!usedOverrides.has(code)) fail(`override ${code}: not used`)

// 4. The counts of docs/04 §21.4.
const count = (values) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())
const byProvince = count(rows.map((r) => r[0]))
const districtsByProvince = count([...districts.keys()].map((d) => d[0]))
const byType = count(rows.map((r) => r[9]))
const wards = rows.reduce((sum, r) => sum + Number(r[10]), 0)
const sameNames = count(rows.map((r) => `${r[3]} ${r[7]}`))
if (rows.length !== EXPECTED.localLevels)
  fail(`${rows.length} local levels, expected ${EXPECTED.localLevels}`)
if (wards !== EXPECTED.wards) fail(`${wards} wards, expected ${EXPECTED.wards}`)
EXPECTED.localLevelsByProvince.forEach((n, i) => {
  if (byProvince.get(String(i + 1)) !== n)
    fail(`province ${i + 1}: ${byProvince.get(String(i + 1))} local levels, expected ${n}`)
})
EXPECTED.districtsByProvince.forEach((n, i) => {
  if (districtsByProvince.get(String(i + 1)) !== n)
    fail(`province ${i + 1}: ${districtsByProvince.get(String(i + 1))} districts, expected ${n}`)
})
for (const [type, n] of Object.entries(EXPECTED.byType))
  if (byType.get(type) !== n) fail(`${byType.get(type)} of type ${type}, expected ${n}`)
for (const [key, n] of sameNames) if (n > 1) fail(`two local levels share the English name ${key}`)

if (problems.length) {
  console.error(problems.join('\n'))
  console.error(`${problems.length} problem(s); ${args.out} not written`)
  process.exit(1)
}

const header = [
  '# DripNepal locations dataset (docs/04 §21.4). Generated by scripts/extract_locations.mjs: never edit by hand.',
  `# Codes, ward counts, types and Nepali names of local levels and districts: Nepal Post, Postal Directorate Biratnagar, ${POST_URL}, downloaded ${args.downloaded}.`,
  `# English names of local levels and districts: Central Bureau of Statistics, "Geographical Codes for States, Districts and Local Bodies", ${CBS_URL} (Creative Commons Attribution), downloaded ${args.downloaded}.`,
  '# Corrections, including local levels renamed since the CBS list: locations_overrides.csv. Province names: docs/04a §9.1.',
  'province_code,province_name_en,province_name_ne,district_code,district_name_en,district_name_ne,code,name_en,name_ne,type,ward_count',
]
writeFileSync(
  args.out,
  [...header, ...rows.map((r) => r.map(csvField).join(','))].join('\n') + '\n'
)
console.log(
  `${args.out}: ${rows.length} local levels, ${districts.size} districts, ${byProvince.size} provinces, ${wards} wards, ${usedOverrides.size} corrections`
)
