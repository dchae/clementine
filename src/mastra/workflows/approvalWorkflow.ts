import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import tools from "../tools";

const toolRequestSchema = z.object({
  toolId: z.string(),
  toolArgs: z.record(z.any()),
});

const approvalPromptStep = createStep({
  id: "approval-prompt",
  description: "Prompts user for approval of tool execution",
  inputSchema: toolRequestSchema,
  resumeSchema: z.object({
    approve: z.boolean(),
  }),
  suspendSchema: z.object({
    prompt: z.string(),
    toolDetails: toolRequestSchema,
  }),
  outputSchema: z.object({
    toolId: z.string(),
    toolArgs: z.record(z.any()),
    approved: z.boolean(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { toolId, toolArgs } = inputData;
    const { approve } = resumeData ?? {};

    // If we don't have resume data (first execution), suspend and wait for user input
    if (!approve) {
      const prompt = [
        `🔐 Tool Execution Approval Required`,
        ``,
        `Tool: ${toolId}`,
        `Arguments: ${JSON.stringify(toolArgs, null, 2)}`,
        ``,
        `Please approve or deny this tool execution.`,
      ]
        .filter(Boolean)
        .join("\n");

      await suspend({
        prompt,
        toolDetails: { toolId, toolArgs },
      });
    }

    return { toolId, toolArgs, approved: !!approve };
  },
});

// Step that executes the tool if approved
const toolExecutionStep = createStep({
  id: "tool-execution",
  description: "Executes the approved tool",
  inputSchema: z.object({
    toolId: z.string(),
    toolArgs: z.record(z.any()),
    approved: z.boolean(),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    toolId: z.string(),
    result: z.any().optional(),
    error: z.string().optional(),
    reason: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const { toolId, toolArgs, approved } = inputData;

    if (!approved) {
      return {
        approved,
        toolId,
        reason: "User denied the tool execution",
      };
    }

    try {
      const toolsRecord: Record<string, (typeof tools)[keyof typeof tools]> =
        tools;
      const tool = toolsRecord[toolId];

      if (!tool) {
        return {
          approved: true,
          toolId,
          error: `Tool '${toolId}' not found in available tools: ${Object.keys(tools).join(", ")}`,
        };
      }

      try {
        const validatedArgs = tool.inputSchema.parse(toolArgs);
        const result = await tool.execute({
          context: validatedArgs,
        });

        return {
          approved: true,
          toolId,
          result,
        };
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          return {
            approved: true,
            toolId,
            error: `Invalid arguments for tool '${toolId}': ${validationError.message}`,
          };
        }
        throw validationError;
      }
    } catch (error) {
      return {
        approved: true,
        toolId,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

// The main approval workflow
export const approvalWorkflow = createWorkflow({
  id: "tool-approval-workflow",
  description: "Human-in-the-loop workflow for tool execution approval",
  inputSchema: toolRequestSchema,
  outputSchema: z.object({
    approved: z.boolean(),
    toolId: z.string(),
    result: z.any().optional(),
    error: z.string().optional(),
    reason: z.string().optional(),
  }),
})
  .then(approvalPromptStep)
  .then(toolExecutionStep)
  .commit();
