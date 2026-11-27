import type { LayoutLine } from '../types';
import {
  analyzeLineSignals,
  isContactOrLinkLine,
  isLikelyHumanName,
  isLinkLabelSegment,
  isLocationSegment,
  scoreOrgName,
  scoreRoleTitle,
} from './signals';

export type HeaderTag = 'NAME' | 'HEADLINE' | 'CONTACT_OR_LINK' | 'LOCATION' | 'META_NOTE' | 'PROSE';

export interface TaggedHeaderLine {
  line: LayoutLine;
  tag: HeaderTag;
}

export function tagHeaderLines(lines: LayoutLine[]): TaggedHeaderLine[] {
  const maxFontSize = lines.reduce((m, l) => Math.max(m, l.fontSize), 0);
  let assignedName = false;

  return lines.map((line, idx) => {
    const text = line.text.trim();
    if (!text) return { line, tag: 'PROSE' };

    if (isContactOrLinkLine(text) || line.links.some((lnk) => isLinkLabelSegment(lnk.label))) {
      const nonLinkSegs = text
        .split(/\s*[|•·]\s*/)
        .map((s) => s.trim())
        .filter((s) => s && !isLinkLabelSegment(s));
      if (nonLinkSegs.length === 0) {
        return { line, tag: 'CONTACT_OR_LINK' };
      }
    }

    if (isLocationSegment(text)) {
      return { line, tag: 'LOCATION' };
    }

    const signals = analyzeLineSignals(text, line.leftText);
    if (
      !assignedName &&
      idx <= 5 &&
      (line.fontSize >= maxFontSize * 0.9 || idx === 0) &&
      signals.personLikelihood &&
      !signals.hasEmail &&
      !signals.hasPhone
    ) {
      assignedName = true;
      return { line, tag: 'NAME' };
    }

    if (signals.roleScore >= 0.65 && !signals.hasEmail && !signals.hasPhone && !isContactOrLinkLine(text)) {
      return { line, tag: 'HEADLINE' };
    }

    if (isContactOrLinkLine(text)) {
      return { line, tag: 'CONTACT_OR_LINK' };
    }

    if (/^(?:u\.?s\.?\s*citizen|authorized|security\s+clearance|gpa|pronouns)/i.test(text)) {
      return { line, tag: 'META_NOTE' };
    }

    if (!assignedName && idx <= 4 && isLikelyHumanName(text)) {
      assignedName = true;
      return { line, tag: 'NAME' };
    }

    return { line, tag: 'PROSE' };
  });
}

export type BodyState =
  | 'ORG_LINE'
  | 'ROLE_LINE'
  | 'COMBINED_HEADER'
  | 'PROJECT_HEADER'
  | 'BULLET'
  | 'CONTINUATION';

const EXP_STATES: readonly BodyState[] = [
  'ORG_LINE',
  'ROLE_LINE',
  'COMBINED_HEADER',
  'BULLET',
  'CONTINUATION',
];

const PROJ_STATES: readonly BodyState[] = [
  'PROJECT_HEADER',
  'ROLE_LINE',
  'BULLET',
  'CONTINUATION',
];

function emissionScore(line: LayoutLine, state: BodyState, mode: 'experience' | 'projects'): number {
  const sig = analyzeLineSignals(line.text, line.leftText);
  const splitParts = line.rightText
    ? [line.leftText, line.rightText]
    : line.text
        .split(/\s*[|•·]\s*|\s+\sat\s+|\s+@\s+/i)
        .map((p) => p.trim())
        .filter(Boolean);

  const hasCombinedSignals =
    !line.hasBullet &&
    (splitParts.length >= 2 &&
      splitParts.some((p) => scoreRoleTitle(p) >= 0.65) &&
      splitParts.some((p) => scoreOrgName(p) >= 0.4 && scoreRoleTitle(p) < 0.65)) ||
    (/\s+(?:at|@)\s+/i.test(line.leftText) && scoreRoleTitle(line.leftText.split(/\s+(?:at|@)\s+/i)[0] || '') >= 0.6);

  switch (state) {
    case 'BULLET': {
      let score = -2.2;
      if (line.hasBullet) score = 5.0;
      else if (sig.hasActionVerb && !sig.hasDate) score = 3.2;
      else if (line.text.length > 90 && sig.roleScore < 0.5) score = 1.6;
      if (sig.hasDate && !line.hasBullet) score -= 2.5;
      if (line.isBold && !line.hasBullet) score -= 2.0;
      return score;
    }
    case 'COMBINED_HEADER': {
      if (line.hasBullet) return -6.0;
      let score = -2.5;
      if (hasCombinedSignals) score = 4.6;
      else if (sig.hasDate && splitParts.length >= 2 && sig.roleScore >= 0.5) score = 3.2;
      else if (splitParts.length >= 3 && !sig.hasActionVerb) score = 2.6;
      return score;
    }
    case 'PROJECT_HEADER': {
      if (line.hasBullet) return -6.0;
      let score = -1.5;
      if (mode === 'projects') {
        if (line.isBold || line.links.length > 0 || sig.hasDate || line.rightText || /\|/.test(line.text)) {
          score = 3.8;
        } else if (!sig.hasActionVerb && line.text.length <= 90) {
          score = 1.8;
        }
      }
      if (sig.hasActionVerb) score -= 2.5;
      return score;
    }
    case 'ROLE_LINE': {
      if (line.hasBullet) return -6.0;
      if (hasCombinedSignals) return -1.0;
      let score = -2.2;
      if (sig.roleScore >= 0.65) {
        score = 3.6 + (line.isItalic ? 1.0 : 0) + (line.isBold ? 0.5 : 0) + (sig.hasDate ? 0.5 : 0);
      } else if (sig.roleScore >= 0.45 && (line.isItalic || line.rightText)) {
        score = 1.8;
      }
      if (sig.hasActionVerb) score -= 3.5;
      return score;
    }
    case 'ORG_LINE': {
      if (line.hasBullet) return -6.0;
      if (hasCombinedSignals) return -1.0;
      let score = -1.8;
      if (sig.orgScore >= 0.72 && sig.roleScore < 0.6) {
        score = 3.8 + (line.isBold ? 0.8 : 0) + (line.rightText || sig.hasDate ? 0.5 : 0);
      } else if (!sig.hasActionVerb && sig.roleScore < 0.6 && (line.isBold || line.rightText || sig.hasDate) && line.text.length <= 95) {
        score = 2.4;
      } else if (!sig.hasActionVerb && sig.roleScore < 0.5 && sig.orgScore >= 0.4) {
        score = 0.9;
      }
      if (sig.hasActionVerb) score -= 3.5;
      return score;
    }
    case 'CONTINUATION': {
      if (line.hasBullet || line.isBold || line.rightText || sig.hasDate || line.gapAbove >= 12) return -6.0;
      if (sig.roleScore >= 0.72 || sig.orgScore >= 0.8) return -3.0;
      if (sig.hasActionVerb) return -1.5;
      return 0.6;
    }
  }
}

function transitionScore(prev: BodyState | 'START', next: BodyState, gapAbove: number): number {
  const newBlockBonus = gapAbove >= 10 ? 1.2 : 0;

  if (prev === 'START') {
    if (next === 'ORG_LINE' || next === 'ROLE_LINE' || next === 'COMBINED_HEADER' || next === 'PROJECT_HEADER') {
      return 2.0;
    }
    if (next === 'BULLET') return 0.6;
    return -3.0;
  }

  if (prev === 'ORG_LINE') {
    if (next === 'ROLE_LINE') return 3.2;
    if (next === 'BULLET') return 2.4;
    if (next === 'ORG_LINE') return -0.8 + newBlockBonus;
    if (next === 'CONTINUATION') return 0.4;
    return -1.5;
  }

  if (prev === 'ROLE_LINE') {
    if (next === 'ORG_LINE') return 2.6;
    if (next === 'BULLET') return 3.0;
    if (next === 'CONTINUATION') return 0.4;
    if (next === 'ROLE_LINE') return -1.2 + newBlockBonus;
    return -1.0;
  }

  if (prev === 'COMBINED_HEADER' || prev === 'PROJECT_HEADER') {
    if (next === 'BULLET') return 3.2;
    if (next === 'ROLE_LINE') return 1.0;
    if (next === 'CONTINUATION') return 0.4;
    return -0.5 + newBlockBonus;
  }

  if (prev === 'BULLET' || prev === 'CONTINUATION') {
    if (next === 'BULLET') return prev === 'BULLET' ? 3.2 : 2.2;
    if (next === 'CONTINUATION') return prev === 'BULLET' ? 1.4 : 0.8;
    if (next === 'ORG_LINE' || next === 'COMBINED_HEADER' || next === 'PROJECT_HEADER') return 1.8 + newBlockBonus;
    if (next === 'ROLE_LINE') return 1.6 + newBlockBonus; // supports promotions under current company
  }

  return 0;
}

/**
 * Linear-chain Viterbi sequence decoder labeling each line in Experience or Projects
 * sections with context-dependent entry/bullet roles.
 */
export function decodeBodySequence(
  lines: LayoutLine[],
  mode: 'experience' | 'projects',
): Array<{ line: LayoutLine; state: BodyState }> {
  if (!lines.length) return [];
  const states = mode === 'experience' ? EXP_STATES : PROJ_STATES;
  const n = lines.length;

  const dp: Array<Record<BodyState, number>> = [];
  const back: Array<Record<BodyState, BodyState | null>> = [];

  for (let i = 0; i < n; i += 1) {
    const scores = {} as Record<BodyState, number>;
    const prevs = {} as Record<BodyState, BodyState | null>;
    const line = lines[i];

    for (const s of states) {
      const emit = emissionScore(line, s, mode);
      if (i === 0) {
        scores[s] = emit + transitionScore('START', s, line.gapAbove);
        prevs[s] = null;
      } else {
        let bestScore = -Infinity;
        let bestPrev: BodyState = states[0];
        for (const p of states) {
          const candidate = dp[i - 1][p] + transitionScore(p, s, line.gapAbove) + emit;
          if (candidate > bestScore) {
            bestScore = candidate;
            bestPrev = p;
          }
        }
        scores[s] = bestScore;
        prevs[s] = bestPrev;
      }
    }

    dp.push(scores);
    back.push(prevs);
  }

  let bestLast: BodyState = states[0];
  let bestLastScore = -Infinity;
  for (const s of states) {
    if (dp[n - 1][s] > bestLastScore) {
      bestLastScore = dp[n - 1][s];
      bestLast = s;
    }
  }

  const decoded = new Array<BodyState>(n);
  let cursor: BodyState | null = bestLast;
  for (let i = n - 1; i >= 0; i -= 1) {
    decoded[i] = cursor || states[0];
    cursor = back[i][decoded[i]];
  }

  return lines.map((line, i) => ({ line, state: decoded[i] }));
}
