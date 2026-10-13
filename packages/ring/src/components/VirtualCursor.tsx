import { E } from "../state/sim";

export function VirtualCursor() {
  return <div class="vcur" ref={el => { E.vcur = el; }} />;
}
