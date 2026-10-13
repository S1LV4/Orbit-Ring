import { E } from "../state/sim";
import { editSig } from "../state/edit";
import { hubClick } from "../hooks/useSelection";

export function Breathe() {
  return <div class="breathe" ref={el => { E.breathe = el; }} />;
}

export function Hub() {
  const edit = editSig.value;
  return (
    <div class="pos" style={{ zIndex: 10 }} ref={el => { E.hN = el; }}>
      <button class="btn hub" tabIndex={-1} onClick={hubClick} ref={el => { E.hB = el; }}>
        <span class="ic plus"><svg viewBox="0 0 24 24" stroke-width="2.2"><path d="M5 12h14" /><path d="M12 5v14" /></svg></span>
        <span class="ic back"><svg viewBox="0 0 24 24" stroke-width="2.2"><path d="m15 18-6-6 6-6" /></svg></span>
        {edit ? <span class="ic trash"><svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg></span> : null}
      </button>
    </div>
  );
}
