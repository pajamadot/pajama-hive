'use client';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3 opacity-30">[ ]</div>
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
