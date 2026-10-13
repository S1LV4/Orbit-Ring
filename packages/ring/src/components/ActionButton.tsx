import { hovered } from "../state/ring-state";
import { ACTION_ICONS, ACTION_LABELS, BUTTON_CENTERS } from "../utils/catalog";
import { executeAction } from "../hooks/useHostBridge";

interface ActionButtonProps {
  index: number;
}

export function ActionButton({ index }: ActionButtonProps) {
  const c = BUTTON_CENTERS[index];
  const isHov = hovered.value === index;

  return (
    <div
      class={`b${isHov ? " hov" : ""}`}
      style={{
        left: `${c.x - 23}px`,
        top: `${c.y - 23}px`,
        animationDelay: `${15 + index * 25}ms`,
      }}
      data-i={index}
      onClick={() => executeAction(index)}
    >
      <svg
        viewBox="0 0 24 24"
        dangerouslySetInnerHTML={{ __html: ACTION_ICONS[index] }}
      />
    </div>
  );
}

interface ActionLabelProps {
  index: number;
}

/** Exact label positions matching the original layout */
const LABEL_STYLES: Record<string, string>[] = [
  { left: "160px", top: "28px", transform: "translateX(-50%)" },
  { left: "254px", top: "82px" },
  { left: "280px", top: "145px" },
  { left: "254px", top: "208px" },
  { left: "160px", top: "278px", transform: "translateX(-50%)" },
  { right: "228px", top: "208px" },
  { right: "256px", top: "145px" },
  { right: "228px", top: "82px" },
];

export function ActionLabel({ index }: ActionLabelProps) {
  const isHov = hovered.value === index;

  return (
    <div class={`lbl${isHov ? " on" : ""}`} style={LABEL_STYLES[index]}>
      {ACTION_LABELS[index]}
    </div>
  );
}
