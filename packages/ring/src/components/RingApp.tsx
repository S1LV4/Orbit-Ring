import { AsciiTerrain } from "./AsciiTerrain";
import { Sectors } from "./Sector";
import { GooLayer } from "./GooLayer";
import { StarField } from "./StarField";
import { Breathe, Hub } from "./Hub";
import { NodesLayer } from "./NodesLayer";
import { VirtualCursor } from "./VirtualCursor";
import { Balloon } from "./Balloon";
import { Toast } from "./Toast";
import { usePhysics } from "../hooks/usePhysics";
import { useSelection } from "../hooks/useSelection";
import { initHostBridge } from "../hooks/useHostBridge";

export function RingApp() {
  useSelection();
  usePhysics(initHostBridge);
  return (
    <>
      <AsciiTerrain />
      <Sectors />
      <GooLayer />
      <StarField />
      <Breathe />
      <NodesLayer />
      <Hub />
      <VirtualCursor />
      <Balloon />
      <Toast />
    </>
  );
}
