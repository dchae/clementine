import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

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
          args: z.string().array(),
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
    }),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { userInput, conversationHistory = [] } = inputData;
    const agent = mastra!.getAgent("clementineAgent");

    try {
      const response = await agent.generate(userInput, {
        context: conversationHistory,
      });

      // If we get here, the agent completed without needing tool approval
      return {
        response: response.text || "I'm sorry, I couldn't generate a response.",
        toolCalls: response.toolCalls,
        toolResults: response.toolResults,
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
  description: "Conversation workflow",
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
