'use client';

import { useState } from 'react';
import type { GeneratedResume } from '@/app/types';

interface ResumePreviewProps {
  generatedResume: GeneratedResume;
}

function sanitizeFilename(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'tailored-resume';
}

export default function ResumePreview({ generatedResume }: ResumePreviewProps) {
  const [copied, setCopied] = useState(false);
  const [showLatex, setShowLatex] = useState(false);
  const { preview } = generatedResume;

  const handleCopy = async () => {
    if (!navigator.clipboard) return;

    await navigator.clipboard.writeText(generatedResume.latex);
    setCopied(true);
  };

  const handleDownload = () => {
    if (typeof document === 'undefined') return;

    const blob = new Blob([generatedResume.latex], { type: 'text/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFilename(preview.fullName)}-resume.tex`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="resume-preview-heading">
      <div className="min-w-0">
        <div className="resume-preview-paper mx-auto min-h-[1056px] w-full max-w-[816px] bg-white px-7 py-8 text-slate-950 shadow-2xl shadow-slate-900/10 sm:px-12 sm:py-10">
          <header className="border-b border-slate-300 pb-4 text-center">
            <h2 id="resume-preview-heading" className="text-2xl font-bold uppercase tracking-normal sm:text-3xl">
              {preview.fullName}
            </h2>
            {preview.headline && (
              <p className="mt-1 text-sm font-semibold text-slate-700">{preview.headline}</p>
            )}
            {preview.contact.length > 0 && (
              <p className="mx-auto mt-2 max-w-3xl text-xs leading-5 text-slate-600">
                {preview.contact.join(' | ')}
              </p>
            )}
          </header>

          {preview.summary && (
            <section className="mt-5">
              <h3 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-normal text-slate-900">
                Summary
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">{preview.summary}</p>
            </section>
          )}

          <div className="mt-5 space-y-5">
            {preview.sections.map((section, sectionIndex) => (
              <section key={`${section.title}-${sectionIndex}`}>
                <h3 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-normal text-slate-900">
                  {section.title}
                </h3>
                <div className="mt-3 space-y-3">
                  {section.items.map((item, itemIndex) => (
                    <div key={`${item.heading}-${itemIndex}`}>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-slate-950">{item.heading}</h4>
                          {(item.subheading || item.meta) && (
                            <p className="text-xs italic leading-5 text-slate-600">
                              {[item.subheading, item.meta].filter(Boolean).join(' | ')}
                            </p>
                          )}
                        </div>
                        {item.date && (
                          <p className="text-xs font-semibold text-slate-600">{item.date}</p>
                        )}
                      </div>
                      {item.details.length > 0 && (
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
                          {item.details.map((detail, detailIndex) => (
                            <li key={`${detail}-${detailIndex}`}>{detail}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {preview.skillGroups.length > 0 && (
              <section>
                <h3 className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-normal text-slate-900">
                  Technical Skills
                </h3>
                <div className="mt-2 space-y-1 text-xs leading-5 text-slate-700">
                  {preview.skillGroups.map((group, index) => (
                    <p key={`${group.label}-${index}`}>
                      <span className="font-bold text-slate-900">{group.label}: </span>
                      {group.skills.join(', ')}
                    </p>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <aside className="resume-preview-chrome space-y-4">
        <div className="clay-panel-muted p-4">
          <h3 className="text-sm font-semibold text-slate-900">Export</h3>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="clay-secondary-button px-3 py-2 text-xs font-bold text-slate-800"
            >
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="clay-secondary-button px-3 py-2 text-xs font-bold text-slate-800"
            >
              {copied ? 'Copied LaTeX' : 'Copy LaTeX'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="clay-secondary-button px-3 py-2 text-xs font-bold text-slate-800"
            >
              Download .tex
            </button>
          </div>
        </div>

        {generatedResume.tailoringNotes.length > 0 && (
          <div className="clay-panel-muted p-4">
            <h3 className="text-sm font-semibold text-slate-900">Tailoring Notes</h3>
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
              {generatedResume.tailoringNotes.map((note, index) => (
                <li key={`${note}-${index}`}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {generatedResume.followUpQuestions.length > 0 && (
          <div className="clay-panel-muted p-4">
            <h3 className="text-sm font-semibold text-slate-900">Still Missing</h3>
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
              {generatedResume.followUpQuestions.map((question, index) => (
                <li key={`${question}-${index}`}>{question}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="clay-panel-muted p-4">
          <button
            type="button"
            onClick={() => setShowLatex((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-slate-900"
            aria-expanded={showLatex}
          >
            <span>LaTeX Source</span>
            <span className="text-xs font-bold uppercase text-teal-800">{showLatex ? 'Hide' : 'Show'}</span>
          </button>
          {showLatex && (
            <textarea
              className="clay-inset mt-3 h-72 w-full resize-y p-3 font-mono text-xs leading-5 text-slate-800"
              value={generatedResume.latex}
              readOnly
              aria-label="Generated LaTeX resume"
            />
          )}
        </div>
      </aside>
    </section>
  );
}
