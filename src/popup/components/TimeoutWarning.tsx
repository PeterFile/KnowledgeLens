interface TimeoutWarningProps {
  onCancel: () => void;
  onRetry: () => void;
}

export function TimeoutWarning({ onCancel, onRetry }: TimeoutWarningProps) {
  return (
    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p className="text-sm text-yellow-800 mb-2">
        ⏱️ This is taking longer than expected...
      </p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs font-medium text-yellow-700 border border-yellow-300 rounded hover:bg-yellow-100"
        >
          Cancel
        </button>
        <button
          onClick={onRetry}
          className="px-3 py-1 text-xs font-medium text-yellow-700 border border-yellow-300 rounded hover:bg-yellow-100"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
