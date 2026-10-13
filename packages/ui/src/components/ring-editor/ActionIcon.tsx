import { SvgIcon } from "./SvgIcon";
import { pluginImage, type ActionDef } from "./catalog";

interface ActionIconProps {
  action: Pick<ActionDef, "icon" | "image">;
  size?: number;
  className?: string;
}

export function ActionIcon({ action, size = 16, className }: ActionIconProps) {
  const image = pluginImage(action.image);
  if (!image) return <SvgIcon markup={action.icon} size={size} className={className} />;
  const px = size + 6;
  return (
    <img
      src={image}
      alt=""
      aria-hidden="true"
      width={px}
      height={px}
      decoding="async"
      draggable={false}
      data-action-image=""
      className="rounded-full object-cover"
      style={{ width: px, height: px, flexShrink: 0, margin: -3, boxShadow: "0 0 0 1px rgba(255,255,255,.14)" }}
    />
  );
}
