import { options, render } from "preact";
import { RingApp } from "./components/RingApp";
import { CFG, S, sim } from "./state/sim";
import { CAT, DEFAULT_GROUPS, GI } from "./utils/catalog";
import { applyConfig } from "./state/ring-state";
import { setTheme } from "./utils/themes";
import { render as renderFrame, step } from "./hooks/usePhysics";
import { back, fire, flash, open, release, reset, updateSelection } from "./hooks/useSelection";

options.debounceRendering = cb => cb();

const stage = document.getElementById("stage");
if (!stage) throw new Error("#stage not found");
render(<RingApp />, stage);

const W = window as unknown as Record<string, unknown>;
Object.assign(W, {
  step, render: renderFrame, applyConfig, setTheme, flash, open, back, release, fire, reset, updateSelection,
  sim, CFG, CAT, GI, DEFAULT_GROUPS,
});
const live = <K extends keyof typeof S>(name: string, key: K) =>
  Object.defineProperty(window, name, { configurable: true, get: () => S[key], set: v => { S[key] = v as typeof S[K]; } });
live("groups", "groups"); live("isOpen", "isOpen"); live("visible", "visible");
live("activeGroup", "activeGroup"); live("hover", "hover"); live("dx", "dx"); live("dy", "dy");
