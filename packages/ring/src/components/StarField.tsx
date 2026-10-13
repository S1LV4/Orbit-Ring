import { E, sim } from "../state/sim";

export function StarField() {
  return (
    <div class="stars" ref={el => { E.stars = el; }}>
      {sim.parts.map((p, i) => (
        <span key={i} class={"star" + (p.white ? " w" : "")} ref={el => { if (el) E.star[i] = el; }} />
      ))}
    </div>
  );
}
