interface Skill {
  name: string;
  match: boolean;
}

interface AnalysisResultProps {
  score: number;
  matchedSkills: Skill[];
  missingSkills: string[];
  isLoading?: boolean;
}

export default function AnalysisResult({
  score,
  matchedSkills,
  missingSkills,
  isLoading = false,
}: AnalysisResultProps) {
  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-8 p-6 bg-white rounded-lg shadow-sm" data-testid="loading-animation">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  const scoreColor = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
  const scoreColorClass = {
    green: 'text-green-600 bg-green-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    red: 'text-red-600 bg-red-50',
  }[scoreColor];

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">Analysis Results</h3>
          <div className={`mt-2 text-3xl font-bold ${scoreColorClass} inline-block px-4 py-2 rounded-full`}>
            {score}% Match
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-2">Matched Skills</h4>
            <div className="flex flex-wrap gap-2">
              {matchedSkills.map((skill, index) => (
                <span
                  key={index}
                  className={`px-3 py-1 rounded-full text-sm ${
                    skill.match
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {skill.name}
                </span>
              ))}
            </div>
          </div>

          {missingSkills.length > 0 && (
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-2">Missing Skills</h4>
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
        </div>

        <div className="mt-6">
          <button
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={() => {
              // TODO: Implement PDF report download
              console.log('Download report');
            }}
          >
            Download Report
          </button>
        </div>
      </div>
    </div>
  );
}