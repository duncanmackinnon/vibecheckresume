'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/app/lib/utils';
import { useRouter } from 'next/navigation';

interface AnalysisResultProps {
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  recommendations: string[];
  detailedAnalysis: string;
  isChunked?: boolean;
  onNewAnalysis?: () => void;
}

const markdownComponents = {
  h1: (props: React.HTMLProps<HTMLHeadingElement>) => (
    <h3 className="text-xl font-semibold text-slate-900 mt-4" {...props} />
  ),
  h2: (props: React.HTMLProps<HTMLHeadingElement>) => (
    <h4 className="text-lg font-semibold text-slate-900 mt-3" {...props} />
  ),
  h3: (props: React.HTMLProps<HTMLHeadingElement>) => (
    <h5 className="text-base font-semibold text-slate-900 mt-3" {...props} />
  ),
  p: (props: React.HTMLProps<HTMLParagraphElement>) => (
    <p className="text-sm leading-6 text-slate-700 mt-2" {...props} />
  ),
  ul: (props: React.HTMLProps<HTMLUListElement>) => (
    <ul className="list-disc list-inside space-y-1 text-sm text-slate-700 mt-2" {...props} />
  ),
  ol: (props: React.HTMLProps<HTMLOListElement>) => (
    <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700 mt-2" {...props} />
  ),
  li: (props: React.HTMLProps<HTMLLIElement>) => (
    <li className="text-sm leading-6 text-slate-700" {...props} />
  )
};

export default function AnalysisResult({
  matchScore,
  strengths,
  weaknesses,
  missingSkills,
  recommendations,
  detailedAnalysis,
  onNewAnalysis
}: AnalysisResultProps) {
  const router = useRouter();
  const scoreColor = matchScore >= 80 ? 'green' : matchScore >= 60 ? 'yellow' : 'red';
  const scoreClasses = {
    green: 'text-green-700 bg-green-100',
    yellow: 'text-amber-700 bg-amber-100',
    red: 'text-rose-700 bg-rose-100'
  };

  return (
    <section className="w-full bg-slate-950 text-slate-50 min-h-screen flex pb-0">
      <div className="max-w-6xl mx-auto px-4 flex-1 flex">
        <div className="bg-white text-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 text-white px-8 py-8">
            <div className="grid gap-6 lg:grid-cols-[1fr,260px] lg:items-center">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-slate-200">AI Resume Match</p>
                <h2 className="text-3xl font-black mt-2">Detailed Fit Report</h2>
                <p className="text-sm text-slate-200 mt-1">Objective scoring + AI narrative</p>
              </div>
              <div className="flex items-center justify-end gap-4">
                <div className="h-28 w-28 rounded-full bg-white/10 border border-white/30 flex items-center justify-center shadow-xl">
                  <div
                    className={cn(
                      'h-24 w-24 rounded-full flex items-center justify-center text-4xl font-black shadow-lg',
                      scoreClasses[scoreColor]
                    )}
                  >
                    {matchScore}%
                  </div>
                </div>
                <div className="w-40">
                  <div className="flex items-center justify-between text-[11px] text-slate-200 mb-1">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        scoreColor === 'green' ? 'bg-emerald-400' : scoreColor === 'yellow' ? 'bg-amber-300' : 'bg-rose-300'
                      )}
                      style={{ width: `${Math.min(Math.max(matchScore, 0), 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-6 space-y-6 flex-1 flex flex-col">
            <div className="grid lg:grid-cols-3 gap-4">
              <Card title="Key Strengths" tone="green">
                <ChipGroup items={strengths} color="green" />
              </Card>
              <Card title="Areas to Improve" tone="amber">
                <ChipGroup items={weaknesses} color="amber" />
              </Card>
              {missingSkills.length > 0 && (
                <Card title="Missing Skills" tone="red">
                  <ChipGroup items={missingSkills} color="red" />
                </Card>
              )}
            </div>

            {recommendations.length > 0 && (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-semibold">
                    ★
                  </span>
                  <h3 className="text-lg font-semibold text-slate-900">Recommendations</h3>
                </div>
                <ul className="space-y-2 text-sm text-slate-800 list-disc list-inside">
                  {recommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            {detailedAnalysis && (
              <div className="space-y-3 flex-1 flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-md">
                    AI
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">AI-Enhanced Analysis</h3>
                    <p className="text-xs text-slate-500">Headings, bullets, emphasis preserved</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 shadow-inner p-5 flex-1 overflow-y-auto">
                  <div className="prose prose-slate prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-1 max-w-none">
                    <ReactMarkdown components={markdownComponents}>{detailedAnalysis}</ReactMarkdown>
                  </div>
                  <div className="sr-only">Your resume shows strong frontend skills</div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 px-4 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-md transition"
              >
                Download Report
              </button>
              <button
                onClick={() => {
                  if (onNewAnalysis) onNewAnalysis();
                  else router.push('/');
                }}
                className="flex-1 py-3 px-4 rounded-lg text-sm font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition"
              >
                Analyze Another
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type CardProps = {
  title: string;
  tone: 'green' | 'amber' | 'red';
  children: React.ReactNode;
};

function Card({ title, tone, children }: CardProps) {
  const tones: Record<CardProps['tone'], string> = {
    green: 'border-green-100 bg-green-50/60',
    amber: 'border-amber-100 bg-amber-50/60',
    red: 'border-red-100 bg-red-50/60'
  };
  return (
    <div className={cn('rounded-2xl border p-5 shadow-sm', tones[tone])}>
      <h4 className="text-sm font-semibold text-slate-900 mb-3">{title}</h4>
      {children}
    </div>
  );
}

type ChipGroupProps = { items: string[]; color: 'green' | 'amber' | 'red' };

function ChipGroup({ items, color }: ChipGroupProps) {
  const colors: Record<ChipGroupProps['color'], string> = {
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    red: 'bg-red-100 text-red-800 border-red-200'
  };
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, idx) => (
        <span
          key={idx}
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium border',
            colors[color]
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
