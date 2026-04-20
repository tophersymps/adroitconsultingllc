type Props = {
  title: string;
  items: string[];
};

export default function ServiceModule({ title, items }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8">
      <h3 className="text-lg font-semibold text-charcoal">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-slate">
            <svg className="mt-1 h-5 w-5 flex-shrink-0 text-navy" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-base leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
