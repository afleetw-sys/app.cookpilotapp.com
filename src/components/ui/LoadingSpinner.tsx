export function LoadingSpinner({
  label = "Loading",
}: {
  label?: string;
}) {
  return (
    <div aria-label={label} className="cp-loading-spinner" role="status">
      <span aria-hidden="true" />
    </div>
  );
}
