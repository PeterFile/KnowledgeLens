import React from 'react';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-brutal">
      <h3 className="font-bold text-xs uppercase mb-4 border-b border-gray-200 pb-2 tracking-wider text-gray-500">
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}
