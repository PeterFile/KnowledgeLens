interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const guidance = getGuidance(error);

  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <p className="text-sm font-medium text-red-800 mb-1">❌ Error</p>
      <p className="text-sm text-red-700 mb-2">{error}</p>
      <p className="text-xs text-red-600 mb-3">{guidance}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
      >
        🔄 Try Again
      </button>
    </div>
  );
}

function getGuidance(error: string): string {
  if (error.includes('API key')) {
    return 'Go to Settings tab to configure your API key.';
  }
  if (error.includes('network') || error.includes('fetch')) {
    return 'Check your internet connection and try again.';
  }
  if (error.includes('rate limit')) {
    return 'You have exceeded the API rate limit. Please wait a moment.';
  }
  if (error.includes('401') || error.includes('403')) {
    return 'Your API key may be invalid. Check Settings.';
  }
  return 'Try again or check your settings.';
}
