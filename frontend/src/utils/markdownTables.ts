// Small, dependency-free renderer boundary for ordinary exported pipe tables.
// Fences and inline code retain their original whitespace and pipe characters.
export type MarkdownBlock = { kind: 'markdown'; content: string } | {
  kind: 'table'; header: string[]; rows: string[][]; align: ('left' | 'center' | 'right')[];
};
export function tableCells(line: string): string[] {
  const value = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const cells: string[] = [];
  let cell = '', ticks = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\' && value[i + 1] === '|') { cell += '|'; i++; continue; }
    if (char === '`') {
      let length = 1;
      while (value[i + length] === '`') length++;
      ticks = ticks === length ? 0 : ticks === 0 ? length : ticks;
      cell += '`'.repeat(length); i += length - 1; continue;
    }
    if (char === '|' && !ticks) { cells.push(cell.trim()); cell = ''; } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}
export function markdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split('\n'), blocks: MarkdownBlock[] = [];
  let prose: string[] = [], fence = '', fenceLength = 0;
  const flush = () => { if (prose.length) { blocks.push({ kind: 'markdown', content: prose.join('\n') }); prose = []; } };
  for (let i = 0; i < lines.length; i++) {
    const delimiter = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) { fence = delimiter[1][0]; fenceLength = delimiter[1].length; }
      else if (delimiter[1][0] === fence && delimiter[1].length >= fenceLength && lines[i].trim() === delimiter[1]) fence = '';
      prose.push(lines[i]); continue;
    }
    const header = tableCells(lines[i]);
    const separators = tableCells(lines[i + 1] || '');
    if (!fence && !/^ {4}|^\t/.test(lines[i]) && lines[i].includes('|') && header.length === separators.length && separators.every(cell => /^:?-{3,}:?$/.test(cell))) {
      flush(); i++;
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim() && lines[i + 1].includes('|') && !/^\s*(`{3,}|~{3,})/.test(lines[i + 1])) {
        const cells = tableCells(lines[++i]);
        rows.push(header.map((_, n) => cells[n] || ''));
      }
      blocks.push({ kind: 'table', header, rows, align: separators.map(cell => cell.endsWith(':') ? cell.startsWith(':') ? 'center' : 'right' : 'left') });
    } else prose.push(lines[i]);
  }
  flush(); return blocks;
}
