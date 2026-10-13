import { E, type Group } from "../state/sim";
import { GI } from "../utils/catalog";

export function nodeRef(key: string, base: string) {
  return (el: HTMLElement | null) => {
    if (el) E.nodes[key] = { n: el, b: el.firstElementChild as HTMLElement, base };
    else if (E.nodes[key]) delete E.nodes[key];
  };
}

export function GroupButton({ g }: { g: Group }) {
  const badge = g.actions.length > 1 ? String(g.actions.length) : "";
  return (
    <div class="pos" ref={nodeRef(g.id, "btn grp")}>
      <button class="btn grp" tabIndex={-1} data-key={g.id}>
        <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: GI[g.icon] || GI.settings }} />
        {badge ? <span class="badge">{badge}</span> : null}
      </button>
    </div>
  );
}
