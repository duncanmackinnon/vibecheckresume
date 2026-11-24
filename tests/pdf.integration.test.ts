import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfText } from '../src/app/lib/pdfUtils';

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
