interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  progress?: number;
}

export default function LoadingSpinner({ className = '', progress, ...props }: LoadingSpinnerProps) {
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