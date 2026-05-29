import { StateBlock } from "@/components/ui/StateBlock";

export default function RecipeNotFound() {
  return (
    <div className="cp-page cp-page--centered">
      <StateBlock
        message="That recipe isn’t available for this account."
        title="Recipe unavailable"
        tone="error"
      />
    </div>
  );
}
