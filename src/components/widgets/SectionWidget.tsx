import type { DashboardWidget } from "../../types";

interface Props {
  widget: DashboardWidget;
}

export default function SectionWidget({ widget }: Props) {
  if (widget.config.type !== "section") return null;
  const { title } = widget.config;

  return (
    <div className="flex h-full items-center gap-3">
      <span className="shrink-0 text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
