import { describe, expect, it } from 'vitest';
import { markdownBlocks, tableCells } from './markdownTables';
import { snippetParts } from './presentation';

describe('exported Markdown', () => {
  it('renders a table without changing inline formatting or column alignment', () => {
    expect(markdownBlocks('Intro\n\n| Name | Dose |\n| :--- | ---: |\n| **Espresso** | 18 g |\n\nEnd')).toEqual([
      {kind:'markdown', content:'Intro\n'},
      {kind:'table', header:['Name','Dose'], rows:[['**Espresso**','18 g']], align:['left','right']},
      {kind:'markdown', content:'\nEnd'},
    ]);
  });
  it('preserves pipe tables inside fenced code and code indentation', () => {
    const content = '```python\nif ready:\n    print("a | b")\n| x | y |\n| --- | --- |\n```';
    expect(markdownBlocks(content)).toEqual([{kind:'markdown', content}]);
  });
  it('keeps escaped pipes and inline code in a single cell', () => {
    expect(tableCells('| a\\|b | `x|y` | ``a`|b`` |')).toEqual(['a|b','`x|y`','``a`|b``']);
  });
  it('does not interpret ordinary prose or indented code as a table', () => {
    const content = 'a | b\nnot | a divider\n\n    a | b\n    --- | ---';
    expect(markdownBlocks(content)).toEqual([{kind:'markdown',content}]);
  });
  it('supports tilde fences containing backticks', () => {
    const content = '~~~md\n```\n| A | B |\n| --- | --- |\n~~~';
    expect(markdownBlocks(content)).toEqual([{kind:'markdown',content}]);
  });
});
it('keeps snippets as text, marking only server-designated matches', () => {
  expect(snippetParts('<script> __CC_HL_START__espresso__CC_HL_END__ & coffee')).toEqual([
    {text:'<script> ',highlight:false},{text:'espresso',highlight:true},{text:' & coffee',highlight:false},
  ]);
});
