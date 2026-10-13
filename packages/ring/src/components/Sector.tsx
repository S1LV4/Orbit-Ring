import { E } from "../state/sim";

export function Sectors() {
  return (
    <>
      <div class="sector" ref={el => { E.sec1 = el; }} />
      <div class="sector" ref={el => { E.sec2 = el; }} />
    </>
  );
}
