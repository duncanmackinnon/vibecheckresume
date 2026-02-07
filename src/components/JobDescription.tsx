'use client';

import { useState } from 'react';
import { cn } from '@/app/lib/utils';

export interface JobDescriptionProps {
  onJobDescriptionSubmit: (jobDescription: string) => void;
  isDisabled?: boolean;
}

export default function JobDescription({ 
  onJobDescriptionSubmit,
  isDisabled = false
}: JobDescriptionProps) {
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      onJobDescriptionSubmit(file.name);
    } else if (description.trim()) {
      onJobDescriptionSubmit(description.trim());
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setDescription('');
    } else {
      // Clear file if input was cleared
      setFile(null);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    // Clear file if text is entered
    if (e.target.value) {
      setFile(null);
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
            value={description}
            onChange={handleTextChange}
            className={cn(
              "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm",
              "focus:ring-blue-500 focus:border-blue-500",
              isDisabled && "bg-gray-100 cursor-not-allowed"
            )}
            placeholder="Paste the job description here..."
            disabled={isDisabled}
          />
        </div>
        <button
          type="submit"
          disabled={!description.trim() || isDisabled}
          className={cn(
            "w-full py-2 px-4 rounded-md text-white font-medium",
            description.trim() && !isDisabled
              ? "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              : "bg-gray-400 cursor-not-allowed"
          )}
        >
          {isDisabled ? "Analyzing..." : "Analyze Resume"}
        </button>
      </form>
    </div>
  );
}
