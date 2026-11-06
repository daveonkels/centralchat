export const platformName = (platform: string) => ({ openai: 'ChatGPT', claude: 'Claude', raycast: 'Raycast' }[platform] || platform);
export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function snippetParts(value: string): { text: string; highlight: boolean }[] {
  const cleaned = value.replace(/\ue200[^\ue201]*\ue201/g, '');
  return cleaned.split(/(__CC_HL_START__.*?__CC_HL_END__)/gs).filter(Boolean).map(part => ({
    text: part.replace(/__CC_HL_START__|__CC_HL_END__/g, ''), highlight: part.startsWith('__CC_HL_START__'),
  }));
}
