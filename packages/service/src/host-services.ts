import { getClaudeUsage } from "./claude-usage";
import { makeThumbnail } from "./thumbnail";
import { protectSecret, unprotectSecret } from "./secret-store";

export const hostServices = { getClaudeUsage, makeThumbnail, protectSecret, unprotectSecret };
