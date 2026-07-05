'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/app/lib/utils';
import { useRouter } from 'next/navigation';
import type { AnalysisEvaluation, PriorityAction, RoleRequirement } from '@/app/types';

interface AnalysisResultProps {
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  recommendations: string[];
  detailedAnalysis: string;
  evaluation?: AnalysisEvaluation;
  roleRequirements?: RoleRequirement[];
  priorityActions?: PriorityAction[];
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
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside space-y-1 text-sm text-slate-700 mt-2" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700 mt-2" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
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
  evaluation,
  roleRequirements,
  priorityActions,
  onNewAnalysis
}: AnalysisResultProps) {
  const router = useRouter();
  const scoreColor = matchScore >= 80 ? 'green' : matchScore >= 60 ? 'yellow' : 'red';
  const scoreClasses = {
    green: 'text-green-700 bg-emerald-100',
    yellow: 'text-amber-700 bg-amber-100',
    red: 'text-rose-700 bg-rose-100'
  };

  return (
    <section className="w-full text-slate-900">
      <div className="space-y-6">
        <div className="clay-panel p-6 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr,280px] lg:items-center">
            <div>
              <p className="clay-kicker text-xs font-bold uppercase">AI Resume Match</p>
              <h2 className="mt-2 text-3xl font-black text-slate-950">Detailed Fit Report</h2>
              <p className="mt-1 text-sm text-slate-600">Objective scoring + AI narrative</p>
            </div>
            <div className="flex items-center justify-start gap-4 sm:justify-end">
              <div className="clay-inset flex h-28 w-28 items-center justify-center rounded-full">
                <div
                  className={cn(
                    'flex h-24 w-24 items-center justify-center rounded-full text-4xl font-black shadow-inner',
                    scoreClasses[scoreColor]
                  )}
                >
                  {matchScore}%
                </div>
              </div>
              <div className="w-40">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase text-slate-500">
                  <span>Low</span>
                  <span>High</span>
                </div>
                <div className="clay-inset h-3 overflow-hidden rounded-full p-0.5">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      scoreColor === 'green' ? 'bg-emerald-500' : scoreColor === 'yellow' ? 'bg-amber-400' : 'bg-rose-400'
                    )}
                    style={{ width: `${Math.min(Math.max(matchScore, 0), 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {priorityActions && priorityActions.length > 0 && (
          <PriorityActionsPanel actions={priorityActions} />
        )}

        {roleRequirements && roleRequirements.length > 0 && (
          <RoleRequirementsPanel requirements={roleRequirements} />
        )}

        {evaluation && <EvaluationScorecard evaluation={evaluation} />}

        <div className="grid gap-4 lg:grid-cols-3">
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
          <div className="clay-panel p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white shadow-inner">
                AI
              </span>
              <h3 className="text-lg font-semibold text-slate-900">Next Actions</h3>
            </div>
            <ul className="list-inside list-disc space-y-2 text-sm text-slate-800">
              {recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>
        )}

        {detailedAnalysis && (
          <div className="clay-panel flex flex-col space-y-3 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f4c7b4] text-sm font-bold text-rose-900 shadow-inner">
                AI
              </span>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">AI-Enhanced Analysis</h3>
                <p className="text-xs text-slate-500">Headings, bullets, emphasis preserved</p>
              </div>
            </div>
            <div className="clay-inset flex-1 overflow-y-auto p-5">
              <div className="prose prose-slate prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-1 max-w-none">
                <ReactMarkdown components={markdownComponents}>{detailedAnalysis}</ReactMarkdown>
              </div>
              <div className="sr-only">Your resume shows strong frontend skills</div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button
            onClick={() => window.print()}
            className="clay-button flex-1 px-4 py-3 text-sm font-bold text-white"
          >
            Download Report
          </button>
          <button
            onClick={() => {
              if (onNewAnalysis) onNewAnalysis();
              else router.push('/');
            }}
            className="clay-secondary-button flex-1 px-4 py-3 text-sm font-bold text-slate-800"
          >
            Analyze Another
          </button>
        </div>
      </div>
    </section>
  );
}

function PriorityActionsPanel({ actions }: { actions: PriorityAction[] }) {
  return (
    <div className="clay-panel p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Top Fixes</h3>
          <p className="text-xs text-slate-500">Highest-impact resume changes to make before applying.</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">
          {actions.length} prioritized
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {actions.map((action, index) => (
          <div key={`${action.title}-${index}`} className="clay-panel-muted p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-black text-white shadow-inner">
                  {index + 1}
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-slate-950">{action.title}</h4>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{action.rationale}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-teal-800">
                {action.impact} impact
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
                {action.effort} effort
              </span>
              <span className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-slate-700">
                {action.categoryId.replace(/_/g, ' ')}
              </span>
            </div>
            {action.exampleRewrite && (
              <div className="clay-inset mt-3 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Example rewrite</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{action.exampleRewrite}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleRequirementsPanel({ requirements }: { requirements: RoleRequirement[] }) {
  const statusClasses: Record<RoleRequirement['status'], string> = {
    matched: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    partial: 'border-amber-200 bg-amber-50 text-amber-800',
    missing: 'border-rose-200 bg-rose-50 text-rose-800',
  };

  return (
    <div className="clay-panel p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Role Requirements</h3>
          <p className="text-xs text-slate-500">How the resume maps to the job description.</p>
        </div>
      </div>
      <div className="clay-inset overflow-x-auto p-2">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="border-b border-white/80 px-3 py-2 font-semibold">Requirement</th>
              <th className="border-b border-white/80 px-3 py-2 font-semibold">Status</th>
              <th className="border-b border-white/80 px-3 py-2 font-semibold">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((requirement, index) => (
              <tr key={`${requirement.text}-${index}`} className="align-top">
                <td className="border-b border-white/60 px-3 py-3 font-medium text-slate-900">
                  {requirement.text}
                </td>
                <td className="w-28 border-b border-white/60 px-3 py-3">
                  <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold capitalize', statusClasses[requirement.status])}>
                    {requirement.status}
                  </span>
                </td>
                <td className="border-b border-white/60 px-3 py-3 leading-6 text-slate-700">
                  {requirement.evidence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EvaluationScorecard({ evaluation }: { evaluation: AnalysisEvaluation }) {
  return (
    <div className="clay-panel p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Evidence Scorecard</h3>
          <p className="text-xs text-slate-500">Category scores are backed by resume and job-description evidence.</p>
        </div>
        <div className="text-sm font-semibold text-slate-700">
          {evaluation.categories.reduce((total, category) => total + category.score, 0)}
          /{evaluation.categories.reduce((total, category) => total + category.max, 0)} base
        </div>
      </div>

      <div className="clay-inset mt-4 overflow-x-auto p-2">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="border-b border-white/80 px-3 py-2 font-semibold">Category</th>
              <th className="border-b border-white/80 px-3 py-2 font-semibold">Score</th>
              <th className="border-b border-white/80 px-3 py-2 font-semibold">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {evaluation.categories.map((category) => (
              <tr key={category.id} className="align-top">
                <td className="border-b border-white/60 px-3 py-3 font-medium text-slate-900">
                  {category.label}
                </td>
                <td className="w-36 border-b border-white/60 px-3 py-3 text-slate-700">
                  <div className="font-semibold">{category.score}/{category.max}</div>
                  <div className="clay-inset mt-1 h-2 overflow-hidden rounded-full p-0">
                    <div
                      className="h-full rounded-full bg-teal-700"
                      style={{ width: `${Math.min(100, Math.max(0, (category.score / category.max) * 100))}%` }}
                    />
                  </div>
                </td>
                <td className="border-b border-white/60 px-3 py-3 leading-6 text-slate-700">
                  {category.evidence}
                </td>
              </tr>
            ))}
            {(evaluation.bonus.score > 0 || evaluation.deductions.score > 0) && (
              <tr className="align-top">
                <td className="px-3 py-3 font-medium text-slate-900">Adjustments</td>
                <td className="w-36 px-3 py-3 text-slate-700">
                  +{evaluation.bonus.score} / -{evaluation.deductions.score}
                </td>
                <td className="px-3 py-3 leading-6 text-slate-700">
                  <span className="font-medium">Bonus:</span> {evaluation.bonus.evidence}
                  <br />
                  <span className="font-medium">Deductions:</span> {evaluation.deductions.evidence}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {evaluation.fairnessNotes.length > 0 && (
        <div className="mt-4 border-t border-white/70 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fairness Guardrails</h4>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
            {evaluation.fairnessNotes.map((note, index) => (
              <li key={`${note}-${index}`}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type CardProps = {
  title: string;
  tone: 'green' | 'amber' | 'red';
  children: React.ReactNode;
};

function Card({ title, tone, children }: CardProps) {
  const tones: Record<CardProps['tone'], string> = {
    green: 'border-emerald-200/80',
    amber: 'border-amber-200/80',
    red: 'border-rose-200/80'
  };
  return (
    <div className={cn('clay-panel p-5', tones[tone])}>
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
      {children}
    </div>
  );
}

type ChipGroupProps = { items: string[]; color: 'green' | 'amber' | 'red' };

function ChipGroup({ items, color }: ChipGroupProps) {
  const colors: Record<ChipGroupProps['color'], string> = {
    green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    red: 'bg-rose-100 text-rose-800 border-rose-200'
  };
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, idx) => (
        <span
          key={idx}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium shadow-inner',
            colors[color]
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
