import { E } from "../state/sim";

export function Balloon() {
  return <div class="balloon" ref={el => { E.bal = el; }} />;
}
