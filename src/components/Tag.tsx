type TagColor = "sf" | "react" | "ai" | "mkt" | "ux" | "pm";

const tagStyles: Record<TagColor, { bg: string; text: string }> = {
  sf: { bg: "bg-sky-light", text: "text-sky-700" },
  react: { bg: "bg-emerald-light", text: "text-emerald-700" },
  ai: { bg: "bg-amber-light", text: "text-amber-700" },
  mkt: { bg: "bg-pink-light", text: "text-pink-700" },
  ux: { bg: "bg-violet-100", text: "text-violet-700" },
  pm: { bg: "bg-teal-100", text: "text-teal-700" },
};

interface TagProps {
  label: string;
  color?: TagColor;
}

export function Tag({ label, color = "sf" }: TagProps) {
  const style = tagStyles[color] ?? tagStyles.sf;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wider ${style.bg} ${style.text}`}
    >
      {label}
    </span>
  );
}
