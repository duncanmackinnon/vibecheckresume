import type { GeneratedResumePreview } from '@/app/types';

// Formatting must not use the shortened profile prepared for scoring.
export function preserveResumeSections(text: string, fullName: string): GeneratedResumePreview['sections'] {
  const sections: GeneratedResumePreview['sections'] = [];
  let section: GeneratedResumePreview['sections'][number] | undefined;
  const heading = /^(?:(?:professional|work|relevant|employment)\s+)?(?:experience|history|summary|profile|education|skills|technical skills|core competencies|projects|certifications|awards|publications|volunteer(?:ing)?(?: experience)?|interests|languages|references|achievements|qualifications)\s*:?$/i;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line === fullName) continue;
    if (heading.test(line) || (line.length < 65 && /^[A-Z][A-Z &/,-]+$/.test(line))) {
      section = { title: line.replace(/:$/, ''), items: [] };
      sections.push(section);
      continue;
    }
    if (!section) {
      section = { title: '', items: [] };
      sections.push(section);
    }
    if (/^[-*•▪◦]\s*/.test(line)) {
      let item = section.items.at(-1);
      if (!item) { item = { heading: '', details: [] }; section.items.push(item); }
      item.details.push(line.replace(/^[-*•▪◦]\s*/, ''));
    } else {
      // Keep titles, organizations, dates, and prose in source order, without guessing their meaning.
      section.items.push({ heading: '', subheading: line, details: [] });
    }
  }
  return sections;
}
