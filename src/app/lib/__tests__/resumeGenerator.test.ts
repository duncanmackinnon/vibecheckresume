import { normalizeGeneratedResume } from '../resumeGenerator';

describe('resumeGenerator normalization', () => {
  it('accepts a complete LaTeX document and normalizes metadata arrays', () => {
    const result = normalizeGeneratedResume({
      latex: String.raw`\documentclass{article}
\begin{document}
Jane Doe
\end{document}`,
      tailoringNotes: ['Targets React requirements', 'Targets React requirements'],
      assumptions: ['Dates were omitted where not supplied.'],
      followUpQuestions: ['What metric proves the frontend impact?'],
    });

    expect(result.latex).toContain(String.raw`\documentclass{article}`);
    expect(result.tailoringNotes).toEqual(['Targets React requirements']);
    expect(result.assumptions).toEqual(['Dates were omitted where not supplied.']);
    expect(result.followUpQuestions).toEqual(['What metric proves the frontend impact?']);
  });

  it('wraps body-only LaTeX in the resume template preamble', () => {
    const result = normalizeGeneratedResume({
      latex: String.raw`\section{Experience}
\resumeSubHeadingListStart
\resumeSubHeadingListEnd`,
    });

    expect(result.latex).toContain(String.raw`\documentclass[letterpaper,11pt]{article}`);
    expect(result.latex).toContain(String.raw`\input{glyphtounicode}`);
    expect(result.latex).toContain(String.raw`\begin{document}`);
    expect(result.latex).toContain(String.raw`\section{Experience}`);
    expect(result.latex).toContain(String.raw`\end{document}`);
  });

  it('strips LaTeX markdown fences before validation', () => {
    const result = normalizeGeneratedResume({
      latex: [
        '```tex',
        String.raw`\documentclass{article}
\begin{document}
Generated resume
\end{document}`,
        '```',
      ].join('\n'),
    });

    expect(result.latex).toBe(String.raw`\documentclass{article}
\begin{document}
Generated resume
\end{document}`);
  });

  it('rejects unsafe LaTeX commands', () => {
    expect(() =>
      normalizeGeneratedResume({
        latex: String.raw`\documentclass{article}
\begin{document}
\input{secrets}
\end{document}`,
      })
    ).toThrow(/unsafe LaTeX commands/);
  });

  it('rejects sample template content', () => {
    expect(() =>
      normalizeGeneratedResume({
        latex: String.raw`\documentclass{article}
\begin{document}
Jake Ryan
\end{document}`,
      })
    ).toThrow(/sample template content/);
  });

  it('rejects unresolved template placeholders', () => {
    expect(() =>
      normalizeGeneratedResume({
        latex: String.raw`\documentclass{article}
\begin{document}
FULL NAME
\end{document}`,
      })
    ).toThrow(/unresolved template placeholders/);
  });
});
