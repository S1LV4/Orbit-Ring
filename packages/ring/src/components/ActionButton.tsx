import { actionImage, actionSvg, keepsIcon, pluginDisplay } from "../utils/catalog";
import { nodeRef } from "./GroupButton";

export function ActionButton({ gid, aid }: { gid: string; aid: string }) {
  const key = gid + ":" + aid, d = pluginDisplay[aid];
  const st = d && d.status ? " st-" + d.status : "";
  const img = actionImage(aid);
  return (
    <div class="pos" ref={nodeRef(key, "btn")}>
      <button class="btn" tabIndex={-1} data-key={key}>
        {img
          ? <span class={"pimgw" + (d && d.text === "–" ? " off" : "")}>
              <img class="pimg" src={img} alt="" width={46} height={46} decoding="async" draggable={false} />
              {d && d.text ? <span class={"ptxt pscrim" + st}>{d.text}</span> : null}
            </span>
          : d && d.text && keepsIcon(aid)
            ? <span class="pstk">
                <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: actionSvg(aid) }} />
                <span class={"ptxt" + st}>{d.text}</span>
              </span>
            : d && d.text
              ? <span class={"ptxt" + st}>{d.text}</span>
              : <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: actionSvg(aid) }} />}
        {d && d.value != null ? (
          <svg class={"gauge" + st} viewBox="0 0 48 48" data-value={d.value}>
            <circle class="trk" cx="24" cy="24" r="20.5" />
            {d.value > 0
              ? <circle class="arc" cx="24" cy="24" r="20.5" pathLength={100} stroke-dasharray={d.value + " 100"} transform="rotate(-90 24 24)" />
              : null}
          </svg>
        ) : null}
      </button>
    </div>
  );
}

export function AddButton({ gid }: { gid: string }) {
  const key = gid + ":+";
  return (
    <div class="pos" ref={nodeRef(key, "btn add")}>
      <button class="btn add" tabIndex={-1} data-key={key}>
        <svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
      </button>
    </div>
  );
}
