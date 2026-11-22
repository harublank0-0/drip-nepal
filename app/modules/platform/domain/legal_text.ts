/*
 * The text of a customer legal document (docs/08 §2.2 `/legal/{documentSlug}`),
 * read from its versioned file in the repository [Assumption in 08 §2.2,
 * owner OD-07] and handed to the page as plain blocks, so the page renders
 * React elements and never raw HTML (docs/07 §7.4, TM-11).
 *
 * The files use a small part of Markdown, which is all a reviewer sees in
 * the pull request that changes them:
 * - the first `# ` line is the title;
 * - `## ` and `### ` lines are headings;
 * - consecutive `- ` lines are a list, and an indented line continues the
 *   item above it;
 * - other lines are paragraph text, and a blank line ends a paragraph.
 * Inline Markdown (links, emphasis) is not interpreted: the characters are
 * shown as written. A file without a title is refused, so a mistake fails
 * the page test instead of rendering an untitled document.
 */
export type LegalBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

export type LegalText = { title: string; blocks: LegalBlock[] }

export function parseLegalText(source: string): LegalText {
  let title: string | null = null
  const blocks: LegalBlock[] = []
  let paragraph: string[] = []
  let list: string[] | null = null

  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const endList = () => {
    if (list) blocks.push({ type: 'list', items: list })
    list = null
  }

  for (const raw of source.replaceAll('\r\n', '\n').split('\n')) {
    const line = raw.trim()
    if (line === '') {
      endParagraph()
      endList()
      continue
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line)
    if (heading) {
      endParagraph()
      endList()
      const text = heading[2].trim()
      if (heading[1].length === 1) {
        if (title !== null) throw new Error('A legal document has one `# ` title')
        title = text
      } else {
        blocks.push({ type: 'heading', level: heading[1].length as 2 | 3, text })
      }
      continue
    }
    if (line.startsWith('- ')) {
      endParagraph()
      list ??= []
      list.push(line.slice(2).trim())
      continue
    }
    // An indented line right under a list item continues that item.
    if (list && /^\s/.test(raw)) {
      const last = list.length - 1
      list[last] = `${list[last]} ${line}`
      continue
    }
    endList()
    paragraph.push(line)
  }
  endParagraph()
  endList()

  if (title === null) throw new Error('A legal document starts with a `# ` title')
  return { title, blocks }
}
