import { useState } from 'react';

interface JobDescriptionProps {
  onJobDescriptionSubmit: (description: string) => void;
}

export default function JobDescription({ onJobDescriptionSubmit }: JobDescriptionProps) {
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim()) {
      onJobDescriptionSubmit(description);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="jobDescription"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Job Description
          </label>
          <textarea
            id="jobDescription"
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Paste the job description here..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={!description.trim()}
          className={`w-full py-2 px-4 rounded-md text-white font-medium
            ${description.trim()
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-gray-400 cursor-not-allowed'
            }`}
        >
          Analyze Resume
        </button>
      </form>
    </div>
  );
}