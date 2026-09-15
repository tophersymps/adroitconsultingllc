"use client";

interface EmptyStateProps {
  /** Decorative emoji shown in the coral circle. Defaults to a plate. */
  icon?: string;
  /** Primary message (e.g. "No recipes found"). */
  title: string;
  /** Supporting copy (e.g. "Try adjusting your search filters."). */
  description?: string;
  /** Optional call-to-action label. Only rendered (with the button) when provided. */
  actionLabel?: string;
  /** Handler for the call-to-action button. */
  onAction?: () => void;
}

/**
 * EmptyState — reusable brand empty state for recipe lists, search with no
 * results, and empty saved-recipes views.
 *
 * Centered, generously padded, with a coral accent circle behind a large
 * decorative emoji. Renders a full-width-tappable pill action only when
 * `actionLabel` is provided.
 */
export default function EmptyState({
  icon = "🍽️",
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const showAction = Boolean(actionLabel);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center md:py-16">
      {/* Decorative emoji — hidden from screen readers */}
      <span
        aria-hidden="true"
        className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-coral-light"
      >
        <span className="text-5xl leading-none">{icon}</span>
      </span>

      <h2 className="mb-1.5 text-xl font-semibold text-dark-roast">{title}</h2>

      {description && (
        <p className="mx-auto mb-5 max-w-sm text-sm text-warm-brown">
          {description}
        </p>
      )}

      {showAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 rounded-full bg-coral px-5 py-2.5 font-medium text-white transition-colors hover:bg-coral-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
