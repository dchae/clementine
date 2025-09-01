import { useState, useCallback, useRef } from "react";
import { PendingToolCall, ConversationMessage } from "../types.js";

const pendingCallbacks = new Map<string, () => Promise<any>>();

export const useToolApproval = () => {
  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>([]);
  const currentInputRef = useRef("");

  const storePendingCallback = useCallback((callId: string, callback: () => Promise<any>) => {
    pendingCallbacks.set(callId, callback);
  }, []);

  const clearPendingToolCalls = useCallback(() => {
    setPendingToolCalls([]);
  }, []);

  const addPendingToolCall = useCallback((toolCall: PendingToolCall) => {
    setPendingToolCalls(prev => [...prev, toolCall]);
  }, []);

  const handleApproval = useCallback(
    async (
      approve: boolean,
      currentPendingCalls: PendingToolCall[],
      conversationHistory: ConversationMessage[],
      agent: any,
      onSuccess: (content: string) => void,
      onError: (error: string) => void
    ) => {
      if (currentPendingCalls.length === 0) return;

      clearPendingToolCalls();

      try {
        if (approve) {
          const toolPromises = currentPendingCalls.map(async (toolCall) => {
            const callback = pendingCallbacks.get(toolCall.callId);
            if (callback) {
              try {
                const result = await callback();
                pendingCallbacks.delete(toolCall.callId);
                return { toolName: toolCall.toolName, result, success: true };
              } catch (error) {
                pendingCallbacks.delete(toolCall.callId);
                return {
                  toolName: toolCall.toolName,
                  error: error instanceof Error ? error.message : "Unknown error",
                  success: false,
                };
              }
            }
            return {
              toolName: toolCall.toolName,
              error: "No callback found",
              success: false,
            };
          });

          const allResults = await Promise.all(toolPromises);

          const failedTools = allResults.filter((result) => !result.success);
          if (failedTools.length > 0) {
            const errorMsg = `Tools failed: ${failedTools.map((t) => `${t.toolName} (${t.error})`).join(", ")}`;
            onError(errorMsg);
            return;
          }

          const toolResults = allResults.filter((result) => result.success);
          const toolResultsContext = toolResults
            .map((tr) => `Tool ${tr.toolName} result: ${JSON.stringify(tr.result, null, 2)}`)
            .join("\n");

          const contextPrompt = `The user asked: "${currentInputRef.current.trim()}"\n\nTool results:\n${toolResultsContext}\n\nPlease provide a helpful response based on these results.`;

          const response = await agent.generate(contextPrompt, {
            context: conversationHistory,
          });

          onSuccess(response.text || "I've processed your request.");
        } else {
          onSuccess("I understand. Let me know if there's another way I can help.");
        }

        currentPendingCalls.forEach((call) => pendingCallbacks.delete(call.callId));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        onError(errorMessage);
        currentPendingCalls.forEach((call) => pendingCallbacks.delete(call.callId));
      }
    },
    [clearPendingToolCalls]
  );

  return {
    pendingToolCalls,
    currentInputRef,
    storePendingCallback,
    addPendingToolCall,
    clearPendingToolCalls,
    handleApproval,
  };
};