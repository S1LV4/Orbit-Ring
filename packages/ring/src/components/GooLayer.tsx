import { DROP_SIZES, E, sim } from "../state/sim";

export function GooLayer() {
  return (
    <div class="goo" ref={el => { E.goo = el; }}>
      <span class="drop" ref={el => { E.hubDrop = el; }}
        style={{ width: "40px", height: "40px", margin: "-20px 0 0 -20px", left: "380px", top: "380px" }} />
      {sim.drops.map((_, i) => {
        const sz = DROP_SIZES[i];
        return (
          <span key={i} class="drop" ref={el => { if (el) E.drops[i] = el; }}
            style={{ width: sz + "px", height: sz + "px", margin: (-sz / 2) + "px 0 0 " + (-sz / 2) + "px" }} />
        );
      })}
    </div>
  );
}
