import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const readFileTool = createTool({
  id: "readFile",
  description: "Read contents of a specified file",
  inputSchema: z.object({
    absolutePath: z.string().describe("Absolute path to a file to read."),
  }),
  outputSchema: z.object({
    content: z.string(),
  }),
  execute: async ({ context }) => {
    return await readFile(context.absolutePath);
  },
});

const readFile = async (absolutePath: string) => {
  const content = "Dummy file content";

  return {
    content,
  };
};
