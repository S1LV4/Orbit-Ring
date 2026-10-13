import { E } from "../state/sim";

export function AsciiTerrain() {
  return (
    <>
      <pre class="asc dim" ref={el => { E.ascDim = el; }} />
      <pre class="asc mid" ref={el => { E.ascMid = el; }} />
      <pre class="asc acc" ref={el => { E.ascAcc = el; }} />
    </>
  );
}
