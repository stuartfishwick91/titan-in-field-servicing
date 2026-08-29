import type { LucideIcon } from "lucide-react";

type Props = {
  title: string;
  icon: LucideIcon;
};

export function PlaceholderModule({ title, icon: Icon }: Props) {
  return (
    <section className="module-page">
      <div className="module-heading">
        <span className="module-icon">
          <Icon size={24} />
        </span>
        <div>
          <p>Module workspace</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="empty-state">
        <p>This module is queued for the next build pass. The navigation, styling, and workspace structure are ready for mock-data workflows.</p>
      </div>
    </section>
  );
}
