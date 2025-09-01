import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import tools from "../tools/index.js";

export const clementineAgent = new Agent({
  name: "Clementine",
  instructions: `
      You are a helpful coding assistant.
`,
  model: openai("gpt-4o-mini"),
  tools,
  memory: new Memory({
    storage: new LibSQLStore({
      url: "file:../mastra.db", // path is relative to the .mastra/output directory
    }),
  }),
});
