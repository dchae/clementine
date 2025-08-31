import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

interface ToolCall {
  toolName: string;
  args: any;
}

interface StepFinishData {
  text: string;
  toolCalls: ToolCall[];
  toolResults: any[];
  finishReason: string;
  usage: any;
}

const conversationStep = createStep({
  id: "conversation",
  description: "Handle user conversation with intelligent tool approval",
  inputSchema: z.object({
    userInput: z.string(),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        }),
      )
      .optional(),
  }),
  outputSchema: z.object({
    response: z.string(),
    toolCalls: z
      .array(
        z.object({
          toolName: z.string(),
          args: z.any(),
        }),
      )
      .optional(),
    toolResults: z.array(z.any()).optional(),
  }),
  suspendSchema: z.object({
    toolCalls: z.array(
      z.object({
        toolName: z.string(),
        args: z.any(),
      }),
    ),
    partialResponse: z.string().optional(),
    context: z.object({
      userInput: z.string(),
      conversationHistory: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          }),
        )
        .optional(),
      stepNumber: z.number(),
    }),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    approvedTools: z
      .array(
        z.object({
          toolName: z.string(),
          result: z.any(),
        }),
      )
      .optional(),
  }),
  execute: async ({ inputData, resumeData, suspend, mastra }) => {
    const { userInput, conversationHistory = [] } = inputData;

    // If we're resuming from a suspension (tool approval decision)
    if (resumeData) {
      const { approved, approvedTools } = resumeData;

      if (approved && approvedTools) {
        // Continue the agent conversation with tool results
        const agent = mastra?.getAgent("clementineAgent");
        if (!agent) {
          throw new Error("Clementine agent not found");
        }

        // Build the conversation context including tool results
        const toolResultsContext = approvedTools
          .map(
            (tool) =>
              `Tool ${tool.toolName} executed successfully with result: ${JSON.stringify(tool.result, null, 2)}`,
          )
          .join("\n");

        const contextMessage = `The user asked: "${userInput}"\n\nI've executed the requested tools. Here are the results:\n${toolResultsContext}\n\nPlease provide a helpful response to the user based on this information.`;

        const finalResponse = await agent.generate(contextMessage);

        return {
          response:
            finalResponse.text || "I've processed your request successfully.",
          toolCalls: approvedTools.map((t) => ({
            toolName: t.toolName,
            args: {},
          })),
          toolResults: approvedTools.map((t) => t.result),
        };
      } else {
        return {
          response:
            "I understand you don't want me to use those tools. I'll help you in another way if possible.",
        };
      }
    }

    // Initial conversation - let the agent decide if it needs tools
    const agent = mastra?.getAgent("clementineAgent");
    if (!agent) {
      throw new Error("Clementine agent not found");
    }

    // Build simple prompt from conversation history and current input
    const conversationContext =
      conversationHistory.length > 0
        ? conversationHistory
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join("\n") + "\n"
        : "";
    const fullPrompt = conversationContext + `user: ${userInput}`;

    let pendingToolCalls: ToolCall[] = [];
    let partialResponse = "";
    let stepNumber = 0;

    try {
      const response = await agent.generate(fullPrompt, {
        maxSteps: 5, // Allow multiple steps
        onStepFinish: async ({
          toolCalls,
          text,
          finishReason,
        }: StepFinishData) => {
          stepNumber++;
          partialResponse = text || "";

          // If the agent wants to call tools, suspend for approval
          if (toolCalls && toolCalls.length > 0) {
            pendingToolCalls = toolCalls;

            // Suspend the workflow for approval
            await suspend({
              toolCalls: toolCalls,
              partialResponse: text || "",
              context: {
                userInput,
                conversationHistory,
                stepNumber,
              },
            });
          }
        },
      });

      // If we get here, the agent completed without needing tool approval
      return {
        response: response.text || "I'm sorry, I couldn't generate a response.",
        toolCalls: response.toolCalls || [],
        toolResults: [], // No tool results since no tools were approved
      };
    } catch (error) {
      // Handle any errors in agent execution
      return {
        response: `I encountered an error while processing your request: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

export const conversationWorkflow = createWorkflow({
  id: "conversation-workflow",
  description: "Improved conversation workflow with intelligent tool approval",
  inputSchema: z.object({
    userInput: z.string(),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        }),
      )
      .optional(),
  }),
  outputSchema: z.object({
    response: z.string(),
    toolCalls: z
      .array(
        z.object({
          toolName: z.string(),
          args: z.any(),
        }),
      )
      .optional(),
    toolResults: z.array(z.any()).optional(),
  }),
})
  .then(conversationStep)
  .commit();
