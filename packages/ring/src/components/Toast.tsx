import { E } from "../state/sim";

export function Toast() {
  return <div class="toast" ref={el => { E.toast = el; }} />;
}
