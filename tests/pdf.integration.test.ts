import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfText } from '../src/app/lib/pdfUtils';
import { readUpload } from '../src/lib/resume-workspace/storage';

function resumePdfWithLinkAnnotation() {
  const stream = [
    'BT',
    '/F1 16 Tf 40 750 Td (Jane Doe) Tj',
    '/F1 10 Tf 0 -22 Td (GitHub | LinkedIn | Portfolio) Tj',
    '/F1 12 Tf 0 -26 Td (Experience) Tj',
    '/F1 11 Tf 0 -18 Td (Product Designer | Linear | 2022 - Present) Tj',
    '/F1 10 Tf 0 -16 Td (- Led design systems across desktop and mobile.) Tj',
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Annots [6 0 R] /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Annot /Subtype /Link /Rect [36 720 90 738] /Border [0 0 0] /A << /Type /Action /S /URI /URI (https://github.com/janedoe) >> >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([pdf], 'jane-annotated.pdf', { type: 'application/pdf' });
}

function resumePdf() {
  const stream = 'BT /F1 12 Tf 40 750 Td (Jane Doe - Product Designer with React experience) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([pdf], 'resume.pdf', { type: 'application/pdf' });
}

test('extracts an actual PDF with the current server parser and worker', async () => {
  assert.match(await extractPdfText(resumePdf()), /Jane Doe - Product Designer with React experience/);
});
test('malformed files produce a useful error without leaking contents', async () => {
  await assert.rejects(extractPdfText(new File(['%PDF private confidential text'], 'bad.pdf')), error => {
    assert.match((error as Error).message, /Could not read this PDF/);
    assert.doesNotMatch((error as Error).message, /confidential/);
    return true;
  });
});

test('readUpload recovers PDF link annotations behind "GitHub | LinkedIn | Portfolio" without polluting roles', async () => {
  const result = await readUpload(resumePdfWithLinkAnnotation());
  assert.equal(result.mimeType, 'application/pdf');
  assert.equal(result.profile?.fullName, 'Jane Doe');
  assert.equal(result.profile?.headline, undefined);
  assert.ok(result.parsedResume.links.some((l) => l.url === 'https://github.com/janedoe'));
  assert.equal(result.suggestedRoles.formatted, 'Product Designer');
});

test('readUpload parses Markdown, LaTeX, and RTF resumes into structured profiles', async () => {
  const mdFile = new File(
    ['# Jordan Park\njordan@park.dev | [GitHub](https://github.com/jpark)\n\n## Experience\n**Staff Software Engineer** | Acme | 2022 - Present\n- Built high-scale APIs.\n'],
    'resume.md',
    { type: 'text/markdown' },
  );
  const mdRes = await readUpload(mdFile);
  assert.equal(mdRes.mimeType, 'text/markdown');
  assert.ok(mdRes.parsedResume.links.some((l) => l.url === 'https://github.com/jpark'));
  assert.equal(mdRes.suggestedRoles.primaryRole, 'Staff Software Engineer');

  const texFile = new File(
    [String.raw`\textbf{Dana Li} \\ \href{https://linkedin.com/in/danali}{LinkedIn} \section{Experience} \resumeSubheading{Stripe}{SF}{Backend Engineer}{2022 -- Present}`],
    'resume.tex',
    { type: 'application/x-tex' },
  );
  const texRes = await readUpload(texFile);
  assert.equal(texRes.mimeType, 'application/x-tex');
  assert.ok(texRes.parsedResume.links.some((l) => l.url === 'https://linkedin.com/in/danali'));
  assert.equal(texRes.suggestedRoles.primaryRole, 'Backend Engineer');

  const rtfFile = new File(
    [String.raw`{\rtf1\ansi {\b Sam Rao}\par Experience\par Data Analyst\tab 2021 - Present\par \bullet Built SQL dashboards.\par }`],
    'resume.rtf',
    { type: 'application/rtf' },
  );
  const rtfRes = await readUpload(rtfFile);
  assert.equal(rtfRes.mimeType, 'application/rtf');
  assert.equal(rtfRes.suggestedRoles.primaryRole, 'Data Analyst');
});
