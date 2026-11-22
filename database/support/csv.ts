/*
 * A small RFC 4180 reader for the reference data in
 * database/seeders/reference/data/ (docs/09 §8.8). It lives outside the
 * seeder paths, so db:seed never loads it as a seeder.
 *
 * Lines that start with `#` before the header are comments: the data files
 * record their source and download date there (docs/04 §21.4). Fields may be
 * quoted, with `""` for a quote inside one; line ends may be LF or CRLF.
 * Every row must have as many fields as the header, and a column name may
 * not repeat, so a shifted or truncated file is refused rather than read.
 */
export class CsvError extends Error {}

export function parseCsv(text: string): Record<string, string>[] {
  const records: { line: number; fields: string[] }[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let recordLine = 1

  const endRecord = () => {
    fields.push(field)
    records.push({ line: recordLine, fields })
    fields = []
    field = ''
  }

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        if (char === '\n') line++
        field += char
      }
    } else if (char === '"' && field === '') {
      quoted = true
    } else if (char === ',') {
      fields.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      endRecord()
      line++
      recordLine = line
    } else {
      field += char
    }
  }
  if (quoted) throw new CsvError(`line ${recordLine}: unterminated quote`)
  if (field !== '' || fields.length > 0) endRecord()

  const rows = records.filter((record) => !(record.fields.length === 1 && record.fields[0] === ''))
  while (rows.length > 0 && rows[0].fields[0].startsWith('#')) rows.shift()
  const header = rows.shift()
  if (!header) throw new CsvError('no header')

  const columns = header.fields.map((name) => name.trim())
  const seen = new Set<string>()
  for (const name of columns) {
    if (seen.has(name)) throw new CsvError(`duplicate column "${name}"`)
    seen.add(name)
  }

  return rows.map((record) => {
    if (record.fields.length !== columns.length) {
      throw new CsvError(
        `line ${record.line} has ${record.fields.length} field(s), expected ${columns.length}`
      )
    }
    return Object.fromEntries(columns.map((name, index) => [name, record.fields[index]]))
  })
}
