import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const requireApproval = (
  originalTool: any,
  approvalRequired: boolean = true,
) => {
  if (!approvalRequired) {
    return originalTool;
  }

  return createTool({
    id: `${originalTool.id}-with-approval`,
    description: `${originalTool.description} (requires approval)`,
    inputSchema: originalTool.inputSchema,
    outputSchema: z.object({
      approved: z.boolean(),
      result: originalTool.outputSchema.optional(),
      error: z.string().optional(),
      reason: z.string().optional(),
    }),
    execute: async ({ context, mastra }) => {
      const workflow = mastra!.getWorkflow("tool-approval-workflow");
      const run = await workflow.createRunAsync();
      const result = await run.start({
        inputData: {
          toolId: originalTool.id,
          toolArgs: context,
          context: `Executing ${originalTool.description}`,
        },
      });

      if (result.status === "suspended") {
        return {
          approved: false,
          error: "Tool execution is pending approval",
          reason: "Waiting for user approval",
        };
      }

      if (result.status === "success") {
        return {
          approved: result.result.approved,
          result: result.result.result,
          error: result.result.error,
          reason: result.result.reason,
        };
      }

      return {
        approved: false,
        error:
          result.error instanceof Error
            ? result.error.message
            : result.error || "Approval workflow failed",
      };
    },
  });
};
