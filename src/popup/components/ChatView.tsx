export function ChatView() {
  return (
    <div className="p-6 h-full flex flex-col items-center justify-center text-center space-y-6">
      <div className="relative">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" className="text-slate-200">
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="absolute -bottom-1 -right-1 bg-blue-50 rounded-full p-2 border border-blue-100">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-800">Interactive Chat</h2>
        <p className="text-sm text-slate-500 max-w-[220px] mx-auto leading-relaxed">
          Chat with the page context directly. Coming in the next update.
        </p>
      </div>

      <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-full text-xs font-medium text-slate-400">
        Status: In Development
      </div>
    </div>
  );
}
