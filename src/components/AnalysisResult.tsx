'use client';

import { cn } from '@/app/lib/utils';

interface AnalysisResultProps {
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  recommendations: string[];
  detailedAnalysis: string;
  isChunked?: boolean;
}

export default function AnalysisResult({
  matchScore,
  strengths,
  weaknesses,
  missingSkills,
  recommendations,
  detailedAnalysis
}: AnalysisResultProps) {
  const scoreColor = matchScore >= 80 ? 'green' : matchScore >= 60 ? 'yellow' : 'red';
  const scoreClasses = {
    green: 'text-green-600 bg-green-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    red: 'text-red-600 bg-red-50'
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
        {/* Score Section */}
        <div className="text-center border-b pb-6">
          <h3 className="text-xl font-medium text-gray-900 mb-2">Match Score</h3>
          <div className={cn('mt-2 text-4xl font-bold inline-block px-6 py-3 rounded-full', scoreClasses[scoreColor])}>
            {matchScore}% Match
          </div>
        </div>

        {/* Skills Analysis */}
        <div className="grid md:grid-cols-2 gap-6 border-b pb-6">
          {/* Strengths */}
          <div>
            <h4 className="text-lg font-medium text-green-700 mb-3">Key Strengths</h4>
            <div className="flex flex-wrap gap-2">
              {strengths.map((strength, index) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-800"
                >
                  {strength}
                </span>
              ))}
            </div>
          </div>

          {/* Weaknesses */}
          <div>
            <h4 className="text-lg font-medium text-red-700 mb-3">Areas for Improvement</h4>
            <div className="flex flex-wrap gap-2">
              {weaknesses.map((weakness, index) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-full text-sm bg-red-100 text-red-800"
                >
                  {weakness}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Missing Skills */}
        {missingSkills.length > 0 && (
          <div className="border-b pb-6">
            <h4 className="text-lg font-medium text-gray-900 mb-3">Missing Skills</h4>
            <div className="flex flex-wrap gap-2">
              {missingSkills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-full text-sm bg-red-100 text-red-800"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="border-b pb-6">
            <h4 className="text-lg font-medium text-blue-700 mb-3">Recommendations</h4>
            <ul className="space-y-2 list-disc list-inside text-gray-600">
              {recommendations.map((recommendation, index) => (
                <li key={index}>{recommendation}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Analysis */}
        {detailedAnalysis && (
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-3">Detailed Analysis</h4>
            <p className="text-gray-600 whitespace-pre-line">{detailedAnalysis}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <button
            onClick={() => window.print()}
            className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Download Report
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Analyze Another Resume
          </button>
        </div>
      </div>
    </div>
  );
}