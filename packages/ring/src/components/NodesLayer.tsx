import { Fragment } from "preact";
import { CFG, E } from "../state/sim";
import { editSig } from "../state/edit";
import { groupsSig, iconVersion } from "../state/ring-state";
import { GroupButton } from "./GroupButton";
import { ActionButton, AddButton } from "./ActionButton";

export function NodesLayer() {
  const groups = groupsSig.value;
  void iconVersion.value;
  const edit = editSig.value;
  return (
    <div ref={el => { E.layer = el; }}>
      {groups.map(g => (
        <Fragment key={g.id}>
          <GroupButton g={g} />
          {g.actions.map(a => <ActionButton key={g.id + ":" + a} gid={g.id} aid={a} />)}
          {edit && g.actions.length < CFG.MA ? <AddButton key={g.id + ":+"} gid={g.id} /> : null}
        </Fragment>
      ))}
    </div>
  );
}
