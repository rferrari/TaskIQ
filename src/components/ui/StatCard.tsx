interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
}

export function StatCard({ title, value, description }: StatCardProps) {
  return (
    <div className="glass-card rounded-xl p-6 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-200">
      <dt className="text-sm font-medium text-slate-400 truncate">{title}</dt>
      <dd className="mt-1 text-3xl font-semibold text-white">{value}</dd>
      {description && (
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      )}
    </div>
  );
}