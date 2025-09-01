import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import tools from "../tools";
import { createTool, type Tool } from "@mastra/core";

const toolRequestSchema = z.object({
  toolId: z.string(),
  toolArgs: z.record(z.any()),
});

const toolApprovalSchema = z.object({
  approved: z.boolean(),
  toolId: z.string(),
  toolArgs: z.record(z.any()),
});

const toolResultSchema = z.object({
  toolResults: z.any(),
  message: z.string().optional(),
});

const handleApprovalStep = createStep({
  id: "handleApprovalStep",
  description: "Handle tool execution approval request",
  resumeSchema: z.object({ approved: z.boolean() }),
  inputSchema: toolRequestSchema,
  outputSchema: toolApprovalSchema,
  execute: async ({ inputData, resumeData, suspend }) => {
    const { toolId, toolArgs } = inputData;

    if (!resumeData) {
      await suspend({ toolId, toolArgs });
      return { toolId, toolArgs, approved: false };
    }

    const { approved } = resumeData;

    return { toolId, toolArgs, approved };
  },
});

const executeToolStep = createStep({
  id: "executeToolStep",
  description: "Handle tool execution",
  inputSchema: toolApprovalSchema,
  outputSchema: toolResultSchema,
  execute: async ({ inputData, mastra }) => {
    const { toolId, toolArgs, approved } = inputData;
    if (!approved) {
      return { message: "User denied tool use" };
    }

    const tool = tools[toolId];
    if (!tool) {
      return { message: `Tool ${toolId} not found` };
    }

    return await tool.execute({ context: toolArgs, mastra });
  },
});

// The main approval workflow
export const toolApprovalWorkflow = createWorkflow({
  id: "toolApprovalWorkflow",
  description: "Human-in-the-loop workflow for tool execution approval",
  inputSchema: toolRequestSchema,
  outputSchema: toolResultSchema,
})
  .then(handleApprovalStep)
  .then(executeToolStep)
  .commit();

export const toolWrapper = (tool: Tool) => {
  return createTool({
    id: `${tool.id}-with-approval`,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    execute: async ({ context, mastra }) => {
      const workflow = mastra!.getWorkflow("toolApprovalWorkflow");
      const run = await workflow.createRunAsync();
      const result = await run.start({
        inputData: {
          toolId: tool.id,
          toolArgs: context,
        },
      });

      return result.result?.toolResults || result.result;
    },
  });
};
