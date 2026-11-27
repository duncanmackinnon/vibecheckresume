/** @jest-environment node */
import {
  formatOriginalBadge,
  parseClientResumeTextByFormat,
  parseLayoutDocument,
  parseTextResume,
  toResumeBuilderProfile,
  validateUpload,
} from '../index';
import { reconstructLayoutFromSpans } from '../layoutOrder';
import { parseResumeFile } from '../server';
import type { RawPositionedSpan } from '../types';

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildMinimalZipBuffer(entries: Array<{ name: string; data: string | Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data;
    const sum = crc32(dataBuf);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    localParts.push(local, dataBuf);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    centralParts.push(central);
    offset += local.length + dataBuf.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function buildMinimalDocxBuffer(): Buffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://github.com/alextaylor" TargetMode="External"/>
</Relationships>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>Alex Taylor</w:t></w:r></w:p>
    <w:p>
      <w:hyperlink r:id="rId1"><w:r><w:t>GitHub</w:t></w:r></w:hyperlink>
      <w:r><w:t> | LinkedIn | Portfolio</w:t></w:r>
    </w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Experience</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Principal Platform Engineer | Northstar Labs | 2022 - Present</w:t></w:r></w:p>
    <w:p><w:r><w:t>- Built low-latency OOXML ingestion services across microservices.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  return buildMinimalZipBuffer([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/document.xml', data: documentXml },
  ]);
}

describe('6-stage multi-format layout & local NLP resume parser', () => {
  it('never classifies "GitHub | LinkedIn | Portfolio" as headline or role and recovers PDF link annotations', () => {
    const spans: RawPositionedSpan[] = [
      { page: 1, text: 'Alex Rivera', x: 48, y: 40, width: 110, height: 18, fontSize: 18, isBold: true, isItalic: false },
      { page: 1, text: 'Toronto, ON', x: 48, y: 60, width: 70, height: 10, fontSize: 10, isBold: false, isItalic: false },
      { page: 1, text: 'GitHub', x: 48, y: 78, width: 38, height: 10, fontSize: 10, isBold: false, isItalic: false, href: 'https://github.com/alex' },
      { page: 1, text: ' | ', x: 88, y: 78, width: 10, height: 10, fontSize: 10, isBold: false, isItalic: false },
      { page: 1, text: 'LinkedIn', x: 100, y: 78, width: 45, height: 10, fontSize: 10, isBold: false, isItalic: false, href: 'https://linkedin.com/in/alex' },
      { page: 1, text: ' | ', x: 147, y: 78, width: 10, height: 10, fontSize: 10, isBold: false, isItalic: false },
      { page: 1, text: 'Portfolio', x: 159, y: 78, width: 45, height: 10, fontSize: 10, isBold: false, isItalic: false, href: 'https://alex.dev' },
      { page: 1, text: 'Experience', x: 48, y: 120, width: 75, height: 13, fontSize: 13, isBold: true, isItalic: false },
      { page: 1, text: 'Acme', x: 48, y: 140, width: 35, height: 11, fontSize: 11, isBold: true, isItalic: false },
      { page: 1, text: 'Corp', x: 86, y: 140, width: 30, height: 11, fontSize: 11, isBold: true, isItalic: false },
      { page: 1, text: 'Seattle, WA', x: 470, y: 140, width: 75, height: 11, fontSize: 11, isBold: false, isItalic: false },
      { page: 1, text: 'Senior Soft', x: 48, y: 156, width: 65, height: 11, fontSize: 11, isBold: false, isItalic: true },
      { page: 1, text: 'ware Engineer', x: 113.5, y: 156, width: 75, height: 11, fontSize: 11, isBold: false, isItalic: true },
      { page: 1, text: 'May 2022 - Present', x: 450, y: 156, width: 100, height: 11, fontSize: 11, isBold: false, isItalic: false },
      { page: 1, text: '- Architected distributed Node.js APIs serving', x: 56, y: 174, width: 250, height: 10, fontSize: 10, isBold: false, isItalic: false },
      { page: 1, text: '2M daily requests with 99.99% uptime.', x: 66, y: 186, width: 210, height: 10, fontSize: 10, isBold: false, isItalic: false },
    ];

    const layout = reconstructLayoutFromSpans([spans], { width: 612, height: 792 }, 3);
    const doc = parseLayoutDocument(layout, 'application/pdf');

    expect(doc.fullName).toBe('Alex Rivera');
    expect(doc.location).toBe('Toronto, ON');
    expect(doc.headline).toBeUndefined();
    expect(doc.links.map((l) => l.url)).toEqual([
      'https://github.com/alex',
      'https://linkedin.com/in/alex',
      'https://alex.dev',
    ]);
    expect(doc.experience).toHaveLength(1);
    expect(doc.experience[0]).toMatchObject({
      company: 'Acme Corp',
      title: 'Senior Software Engineer',
      dateRange: 'May 2022 - Present',
      isCurrent: true,
    });
    expect(doc.experience[0].bullets[0]).toContain('Architected distributed Node.js APIs serving 2M daily requests');
    expect(doc.suggestedRoles.formatted).toBe('Senior Software Engineer');
    expect(doc.suggestedRoles.confidence).toBeGreaterThanOrEqual(0.8);

    // Pasted plain text with unlinked "GitHub | LinkedIn | Portfolio" and only a Skills section
    const plain = parseTextResume(`
Alex Rivera
alex@example.com
GitHub | LinkedIn | Portfolio

Skills
Python, SQL, TypeScript
`);
    expect(plain.headline).toBeUndefined();
    expect(plain.suggestedRoles.formatted).toBe('');
    expect(plain.suggestedRoles.confidence).toBeLessThan(0.65);
  });

  it('separates 2-column layouts without interleaving sidebar items into experience bullets', () => {
    const spans: RawPositionedSpan[] = [
      { page: 1, text: 'Maya Lin', x: 40, y: 42, width: 120, height: 20, fontSize: 20, isBold: true, isItalic: false },
      { page: 1, text: 'Product Designer', x: 40, y: 66, width: 110, height: 12, fontSize: 12, isBold: false, isItalic: false },
      // Left sidebar (x=40..150) & right main column (x=220..560) sharing Y coordinates
      { page: 1, text: 'CONTACT', x: 40, y: 190, width: 65, height: 12, fontSize: 12, isBold: true, isItalic: false },
      { page: 1, text: 'EXPERIENCE', x: 220, y: 190, width: 95, height: 12, fontSize: 12, isBold: true, isItalic: false },

      { page: 1, text: 'maya@lin.design', x: 40, y: 210, width: 90, height: 10, fontSize: 10, isBold: false, isItalic: false },
      { page: 1, text: 'Senior Product Designer | Linear | 2022 - Present', x: 220, y: 210, width: 250, height: 11, fontSize: 11, isBold: true, isItalic: false },

      { page: 1, text: 'San Francisco, CA', x: 40, y: 226, width: 95, height: 10, fontSize: 10, isBold: false, isItalic: false },
      { page: 1, text: '- Redesigned keyboard-first issue triage workflows.', x: 228, y: 226, width: 260, height: 10, fontSize: 10, isBold: false, isItalic: false },

      { page: 1, text: 'GitHub | Portfolio', x: 40, y: 242, width: 95, height: 10, fontSize: 10, isBold: false, isItalic: false, href: 'https://lin.design' },
      { page: 1, text: '- Led usability sessions across 40 customer teams.', x: 228, y: 242, width: 250, height: 10, fontSize: 10, isBold: false, isItalic: false },

      { page: 1, text: 'SKILLS', x: 40, y: 270, width: 55, height: 12, fontSize: 12, isBold: true, isItalic: false },
      { page: 1, text: 'Product Designer | Figma Corp | 2020 - 2022', x: 220, y: 270, width: 240, height: 11, fontSize: 11, isBold: true, isItalic: false },

      { page: 1, text: 'Figma, Prototyping, Design Systems', x: 40, y: 288, width: 135, height: 10, fontSize: 10, isBold: false, isItalic: false },
      { page: 1, text: '- Built accessible component library for web teams.', x: 228, y: 288, width: 265, height: 10, fontSize: 10, isBold: false, isItalic: false },

      { page: 1, text: 'User Research, HTML, CSS', x: 40, y: 304, width: 125, height: 10, fontSize: 10, isBold: false, isItalic: false },
      { page: 1, text: '- Partnered closely with engineering on motion specs.', x: 228, y: 304, width: 265, height: 10, fontSize: 10, isBold: false, isItalic: false },
    ];

    const layout = reconstructLayoutFromSpans([spans], { width: 612, height: 792 }, 1);
    expect(layout.layoutType).toBe('two-column');
    const doc = parseLayoutDocument(layout, 'application/pdf');
    expect(doc.fullName).toBe('Maya Lin');
    expect(doc.headline).toBe('Product Designer');
    expect(doc.email).toBe('maya@lin.design');
    expect(doc.location).toBe('San Francisco, CA');
    expect(doc.flatSkills).toEqual(expect.arrayContaining(['Figma', 'Prototyping', 'Design Systems']));
    expect(doc.experience).toHaveLength(2);
    expect(doc.experience[0].bullets).toEqual([
      'Redesigned keyboard-first issue triage workflows.',
      'Led usability sessions across 40 customer teams.',
    ]);
  });

  it('uses local NLP + Viterbi sequence tagging for entity disambiguation, promotions, custom headings, and cross-industry roles', () => {
    const resume = `
Taylor Morgan
taylor@morgan-example.test | GitHub | LinkedIn | Portfolio

Where I've Worked
Morgan Stanley
Quantitative Researcher | 2023 - Present
Built factor risk models and automated portfolio backtests.

Stripe
Member of Technical Staff | 2021 - 2023
Architected ledger reconciliation pipelines across global currencies.
Software Engineer | 2019 - 2021
Reduced checkout latency by 28% for high-volume merchants.

General Hospital
Clinical Research Coordinator | 2017 - 2019
Coordinated Phase III clinical trial enrollment and patient safety logs.
`;
    const doc = parseTextResume(resume);
    expect(doc.fullName).toBe('Taylor Morgan');
    expect(doc.headline).toBeUndefined();
    expect(doc.experience.map((e) => ({ company: e.company, title: e.title }))).toEqual([
      { company: 'Morgan Stanley', title: 'Quantitative Researcher' },
      { company: 'Stripe', title: 'Member of Technical Staff' },
      { company: 'Stripe', title: 'Software Engineer' },
      { company: 'General Hospital', title: 'Clinical Research Coordinator' },
    ]);
    // Glyph-less action-verb lines captured cleanly as bullets
    expect(doc.experience[0].bullets).toEqual([
      'Built factor risk models and automated portfolio backtests.',
    ]);
    expect(doc.suggestedRoles.roles).toEqual([
      'Quantitative Researcher',
      'Member of Technical Staff',
      'Software Engineer',
    ]);
  });

  it('infers early-career domain role titles for students without returning raw skill tokens', () => {
    const studentResume = `
Sam Patel
sam@university.edu | GitHub | LinkedIn

Education
State University | B.S. in Computer Science | May 2025

Projects
TaskFlow | React, Node.js, PostgreSQL | 2024
- Built real-time collaborative sprint tracker with TypeScript and REST APIs.
`;
    const doc = parseTextResume(studentResume);
    expect(doc.headline).toBeUndefined();
    expect(doc.suggestedRoles.source).toBe('projects_education');
    expect(doc.suggestedRoles.confidence).toBeGreaterThanOrEqual(0.65);
    expect(doc.suggestedRoles.primaryRole).toBe('Full-Stack Developer');
    expect(doc.suggestedRoles.formatted).not.toMatch(/GitHub|LinkedIn/);
  });

  it('parses RTF, Markdown, LaTeX, and DOCX formats and recovers embedded hyperlinks', async () => {
    const rtf = String.raw`{\rtf1\ansi {\b Chris Park}\par Chris@example.com | {\field{\*\fldinst HYPERLINK "https://linkedin.com/in/chrispark"}{\fldrslt LinkedIn}}\par {\b Experience}\par DevOps Engineer\tab 2021 - Present\par \bullet Managed Kubernetes clusters.\par }`;
    const rtfDoc = parseClientResumeTextByFormat(rtf, 'application/rtf');
    expect(rtfDoc.fullName).toBe('Chris Park');
    expect(rtfDoc.links.some((l) => l.url === 'https://linkedin.com/in/chrispark')).toBe(true);
    expect(rtfDoc.suggestedRoles.primaryRole).toBe('DevOps Engineer');

    const md = `
# Dana Kim
dana@kim.dev | [GitHub](https://github.com/danakim) | [Portfolio](https://danakim.dev)

## Experience
**Staff Security Engineer** | CloudGuard | 2022 - Present
- Hardened zero-trust service mesh authentication.
`;
    const mdDoc = parseClientResumeTextByFormat(md, 'text/markdown');
    expect(mdDoc.fullName).toBe('Dana Kim');
    expect(mdDoc.links.map((l) => l.url)).toEqual(['https://github.com/danakim', 'https://danakim.dev']);
    expect(mdDoc.suggestedRoles.primaryRole).toBe('Staff Security Engineer');

    const tex = String.raw`
\documentclass{article}
\begin{document}
\textbf{\Huge Riley Chen} \\
riley@chen.io $|$ \href{https://github.com/rileychen}{GitHub} $|$ \href{https://linkedin.com/in/rileychen}{LinkedIn}
\section{Experience}
\resumeSubheading{Veridian Systems}{Austin, TX}{Backend Engineer}{Jan 2023 -- Present}
\resumeItem{Scaled high-throughput Go microservices and Kafka consumers.}
\end{document}
`;
    const texDoc = parseClientResumeTextByFormat(tex, 'application/x-tex');
    expect(texDoc.fullName).toBe('Riley Chen');
    expect(texDoc.headline).toBeUndefined();
    expect(texDoc.links.map((l) => l.url)).toEqual([
      'https://github.com/rileychen',
      'https://linkedin.com/in/rileychen',
    ]);
    expect(texDoc.experience[0]).toMatchObject({
      company: 'Veridian Systems',
      title: 'Backend Engineer',
      dateRange: 'Jan 2023 - Present',
    });
    expect(texDoc.suggestedRoles.primaryRole).toBe('Backend Engineer');

    const docxBuffer = buildMinimalDocxBuffer();
    const docxFile = new File(
      [new Uint8Array(docxBuffer)],
      'alex-taylor.docx',
      { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    );
    const docxResult = await parseResumeFile(docxFile);
    expect(docxResult.parsedResume.fullName).toBe('Alex Taylor');
    expect(docxResult.parsedResume.links.some((l) => l.url === 'https://github.com/alextaylor')).toBe(true);
    expect(docxResult.parsedResume.headline).toBeUndefined();
    expect(docxResult.parsedResume.suggestedRoles.primaryRole).toBe('Principal Platform Engineer');
    expect(toResumeBuilderProfile(docxResult.parsedResume)?.workHighlights).toEqual([
      'Built low-latency OOXML ingestion services across microservices.',
    ]);
  });

  it('validates supported resume formats and rejects legacy .doc, executables, and oversized files', () => {
    expect(validateUpload({ name: 'cv.pdf', type: 'application/pdf', size: 100 })).toBe('application/pdf');
    expect(
      validateUpload({
        name: 'cv.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 100,
      }),
    ).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(validateUpload({ name: 'cv.rtf', type: 'application/rtf', size: 100 })).toBe('application/rtf');
    expect(validateUpload({ name: 'cv.md', type: 'text/markdown', size: 100 })).toBe('text/markdown');
    expect(validateUpload({ name: 'cv.tex', type: 'application/x-tex', size: 100 })).toBe('application/x-tex');
    expect(validateUpload({ name: 'cv.txt', type: 'text/plain', size: 100 })).toBe('text/plain');

    expect(() => validateUpload({ name: 'legacy.doc', type: 'application/msword', size: 100 })).toThrow('Unsupported legacy .doc');
    expect(() => validateUpload({ name: 'malware.exe', type: 'application/pdf', size: 100 })).toThrow('Unsupported');
    expect(() => validateUpload({ name: 'huge.docx', type: '', size: 8 * 1024 * 1024 + 1 })).toThrow('8 MB');

    expect(formatOriginalBadge('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('DOCX original');
    expect(formatOriginalBadge('application/x-tex')).toBe('TEX original');
    expect(formatOriginalBadge('text/markdown')).toBe('MD original');
    expect(formatOriginalBadge('application/rtf')).toBe('RTF original');
  });
});
