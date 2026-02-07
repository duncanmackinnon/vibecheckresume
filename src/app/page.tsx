'use client';

import { useState } from 'react';
import type { Analysis } from './types';

function LoadingSpinner({ className = '', progress, ...props }: { className?: string; progress?: number }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} {...props}>
      <div className="animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent" />
      {progress !== undefined && (
        <div className="absolute text-sm font-bold text-blue-600">
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm text-red-700">{message}</p>
        </div>
      </div>
    </div>
  );
}

function sanitizeFile(file: File): File {
  return new File([file], file.name, {
    type: file.type || 'application/octet-stream',
  });
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !jobDescription.trim()) return;

    setLoading(true);
    setError('');
    setAnalysis(null);

    try {
      // Create FormData with sanitized inputs
      const formData = new FormData();
      formData.append('resume', sanitizeFile(file));
      
      // Create a text file for job description
      const jobDescriptionBlob = new Blob([jobDescription.trim()], { type: 'text/plain' });
      formData.append('jobDescription', jobDescriptionBlob, 'jobDescription.txt');

      // Send request with retry logic
      let response: Response | null = null;
      let retries = 3;
      
      while (retries > 0) {
        try {
          response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData,
            headers: {
              'Accept': 'application/json',
            },
          });
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!response) {
        throw new Error('Failed to connect to server');
      }

      // Check for response validity
      if (!response || !response.ok) {
        const status = response?.status || 'no response';
        const errorData = await response?.json().catch(() => ({ error: `HTTP error! status: ${status}` })) || { error: `HTTP error! status: ${status}` };
        const errorValue = errorData.error;
        const errorMessage =
          typeof errorValue === 'string'
            ? errorValue
            : errorValue?.message
            ? errorValue.message
            : JSON.stringify(errorValue ?? `HTTP error! status: ${status}`);
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Invalid response type from server');
      }

      const data = await response.json();
      
      // Validate response structure
      if (!data || typeof data.score !== 'number' || !Array.isArray(data.matchedSkills)) {
        throw new Error('Invalid analysis result structure');
      }

      setAnalysis(data);
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div key="header" className="text-center space-y-2 animate-fade-in">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Resume Match Analyzer
          </h1>
          <p className="text-gray-600">
            Get instant feedback on how well your resume matches job requirements
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-xl shadow-md transition-all hover:shadow-lg">
          <div key="file-container" className="space-y-1">
            <label htmlFor="resume-upload" className="block text-sm font-medium text-gray-700">
              Upload Resume
            </label>
            <input
              type="file"
              accept="application/pdf"
              id="resume-upload"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) {
                  setFile(selectedFile);
                  setError(''); // Clear any previous errors
                }
              }}
              disabled={loading}
            />
          </div>

          <div key="textarea-container" className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Job Description
            </label>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={6}
              placeholder="Paste the job description here..."
              value={jobDescription}
              onChange={(e) => {
                setJobDescription(e.target.value);
                setError(''); // Clear any previous errors
              }}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !file || !jobDescription.trim()}
            className="w-full p-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-2"
          >
            {loading && <LoadingSpinner key="spinner" />}
            {loading ? 'Analyzing...' : 'Analyze Resume'}
          </button>
        </form>

        {/* Error message */}
        {error && <ErrorDisplay message={error} />}

        {/* Results */}
        {analysis && !error && (
          <div key="result" className="mt-6 bg-white p-8 rounded-xl shadow-lg space-y-8 animate-fade-in">
            {/* Score */}
            <div key="score" className="text-center">
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Match Score</h2>
              <div className={`text-5xl font-bold ${
                analysis.score >= 70 ? 'text-green-500' :
                analysis.score >= 50 ? 'text-yellow-500' : 'text-red-500'
              }`}>
                {analysis.score}%
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                <div
                  className={`${
                    analysis.score >= 70 ? 'bg-green-500' :
                    analysis.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  } h-2.5 rounded-full transition-all duration-1000 ease-out`}
                  style={{ width: `${analysis.score}%` }}
                />
              </div>
            </div>

            {/* Analysis sections */}
            <div key="analysis-sections" className="space-y-6">
              {/* Matched Skills */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-800">
                  Matched Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.matchedSkills
                    .filter(skill => skill.match)
                    .map((skill, i) => (
                      <span
                        key={i}
                        className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded-full flex items-center"
                      >
                        <svg className="w-3 h-3 mr-1.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {skill.name}
                      </span>
                    ))}
                </div>
              </div>

              {/* Missing Skills */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-800">
                  Skills to Improve
                </h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.missingSkills.map((skill, i) => (
                    <span
                      key={i}
                      className="bg-red-100 text-red-800 text-sm font-medium px-2.5 py-0.5 rounded-full flex items-center"
                    >
                      <svg className="w-3 h-3 mr-1.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              {analysis.recommendations?.improvements?.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">
                    Recommended Improvements
                  </h3>
                  <div className="space-y-3">
                    {analysis.recommendations.improvements.map((improvement, i) => (
                      <div key={i} className="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-r">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-yellow-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="text-gray-700">{improvement}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Format Suggestions */}
              {analysis.recommendations?.format?.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">
                    Format Suggestions
                  </h3>
                  <div className="space-y-3">
                    {analysis.recommendations.format.map((format, i) => (
                      <div key={i} className="p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="text-gray-700">{format}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Analysis */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-800">
                  Detailed Analysis
                </h3>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {analysis.detailedAnalysis}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
