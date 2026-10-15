import fs from "fs";
import path from "path";
import { SERVICE_TOKEN_FILE, serviceProtocols, serviceUrl } from "@orbitring/shared/src/protocol";

export function readServiceToken(home: string): string {
  try {
    return fs.readFileSync(path.join(home, ".orbit", SERVICE_TOKEN_FILE), "utf8").trim();
  } catch {
    return "";
  }
}

export const serviceSocketArgs = (home: string): [string, string[]] => [serviceUrl(), serviceProtocols(readServiceToken(home))];

export const tokenForSender = (sender: unknown, configContents: unknown, home: string): string =>
  configContents && sender === configContents ? readServiceToken(home) : "";
