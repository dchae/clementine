import { useState, useCallback, useEffect } from "react";
import { Box } from "ink";
import "dotenv/config";
import { RuntimeContext } from "@mastra/core/di";

import { mastra } from "@clementine/mastra";
import { AppProps, PendingToolCall } from "./types.js";
import { createErrorMessage } from "./utils/messageUtils.js";
import { useConversation } from "./hooks/useConversation.js";
import { useToolApproval } from "./hooks/useToolApproval.js";
import { useInputHandling } from "./hooks/useInput.js";
import { Header } from "./components/Header.js";
import { Messages } from "./components/Messages.js";
import { ApprovalRequest } from "./components/ApprovalRequest.js";
import { InputArea } from "./components/InputArea.js";
import { HelpText } from "./components/HelpText.js";
import { DebugPanel } from "./components/DebugPanel.js";

const agent = mastra.getAgent("clementineAgent");
const runtimeContext = new RuntimeContext();

const App = ({ name = "User", verbose = false }: AppProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Verbose logging helper
  const log = useCallback(
    (message: string) => {
      if (verbose) {
        const logMessage = `[${new Date().toLocaleTimeString()}] ${message}`;
        setDebugLogs((prev) => [...prev, logMessage]);
      }
    },
    [verbose],
  );

  // Log app start
  useEffect(() => {
    log("Clementine app initialized");
  }, []);

  const {
    messages,
    conversationHistory,
    addMessage,
    addUserMessage,
    addAssistantMessage,
  } = useConversation(name);

  const {
    pendingToolCalls,
    currentInputRef,
    storePendingCallback,
    addPendingToolCall,
    handleApproval,
  } = useToolApproval();

  const onApprovalComplete = useCallback(
    (content: string) => {
      log(`Tool approval completed, response: "${content}"`);
      addAssistantMessage(content);
      setIsLoading(false);
    },
    [addAssistantMessage],
  );

  const handleApprovalWrapper = useCallback(
    (approve: boolean) => {
      log(
        `User ${approve ? "approved" : "rejected"} ${pendingToolCalls.length} tool call(s)`,
      );
      handleApproval(
        approve,
        pendingToolCalls,
        conversationHistory,
        agent,
        onApprovalComplete,
        onApprovalComplete, // Same callback for both success and error cases
      );
    },
    [handleApproval, pendingToolCalls, conversationHistory, onApprovalComplete],
  );

  const [inputUtilities, setInputUtilities] = useState<{
    getCurrentInput: () => string;
    clearInput: () => void;
  } | null>(null);

  // Helper function to generate user-friendly messages for different tools
  const getToolApprovalMessage = useCallback(
    (toolName: string, args: any): string => {
      switch (toolName) {
        case "readFileTool":
          return `Read file: ${args.absolutePath}`;
        case "shellTool":
          return `Execute command: ${args.command}${args.directory ? ` (in ${args.directory})` : ""}`;
        case "editTool":
          return args.old_string === ""
            ? `Create new file: ${args.file_path}`
            : `Edit file: ${args.file_path}`;
        default:
          return `Execute ${toolName} with args: ${JSON.stringify(args)}`;
      }
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!inputUtilities) return;

    const currentInput = inputUtilities.getCurrentInput();
    if (!currentInput || isLoading || pendingToolCalls.length > 0) return;

    log(`User submitted: "${currentInput}"`);
    addUserMessage(currentInput);
    currentInputRef.current = currentInput;
    inputUtilities.clearInput();
    setIsLoading(true);

    try {
      log("Loading agent tools...");
      const tools = await agent.getTools();
      log(
        `Loaded ${Object.keys(tools).length} tools: ${Object.keys(tools).join(", ")}`,
      );
      let toolCallsToApprove: PendingToolCall[] = [];

      let response;
      try {
        response = await agent.generate(currentInput, {
          context: conversationHistory,
          onStepFinish: async ({ toolCalls }) => {
            if (toolCalls && toolCalls.length > 0) {
              log(
                `Agent requested ${toolCalls.length} tool calls: ${toolCalls.map((tc) => tc.toolName).join(", ")}`,
              );
              for (const toolCall of toolCalls) {
                log(
                  `Requesting approval for tool: ${toolCall.toolName} with args: ${JSON.stringify(toolCall.args)}`,
                );
                const callId = `${toolCall.toolName}-${Date.now()}-${Math.random()}`;

                storePendingCallback(callId, async () => {
                  log(`Executing tool: ${toolCall.toolName}`);
                  const tool = tools[toolCall.toolName as keyof typeof tools];
                  if (!tool) {
                    throw new Error(`Tool '${toolCall.toolName}' not found`);
                  }
                  const result = await (tool as any).execute({
                    context: toolCall.args,
                    mastra,
                    runtimeContext,
                  });
                  log(`Tool ${toolCall.toolName} completed successfully`);
                  return result;
                });

                const pendingCall: PendingToolCall = {
                  toolName: toolCall.toolName,
                  args: toolCall.args,
                  message: getToolApprovalMessage(
                    toolCall.toolName,
                    toolCall.args,
                  ),
                  callId,
                };

                addPendingToolCall(pendingCall);
                toolCallsToApprove.push(pendingCall);
              }

              if (toolCallsToApprove.length > 0) {
                log(
                  `Waiting for user approval for ${toolCallsToApprove.length} tool calls`,
                );
                return; // Wait for approval
              }
            }
          },
        });
      } catch (error) {
        // Tool validation error occurred during agent.generate()
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        log(
          `Agent generation failed with tool validation error: ${errorMessage}`,
        );

        // Send error back to agent for correction
        const errorPrompt = `Your previous tool call failed with this error: ${errorMessage}\n\nPlease retry the user's original request: "${currentInput}" by calling the tool again with corrected parameters.`;

        try {
          response = await agent.generate(errorPrompt, {
            context: conversationHistory,
          });
          addAssistantMessage(
            response.text || "Let me correct that and try again.",
          );
          setIsLoading(false);
          return;
        } catch (retryError) {
          log(
            `Failed to handle validation error: ${retryError instanceof Error ? retryError.message : "Unknown error"}`,
          );
          addMessage(
            createErrorMessage(
              "I encountered an error. Please try rephrasing your request.",
            ),
          );
          setIsLoading(false);
          return;
        }
      }

      if (toolCallsToApprove.length === 0) {
        log(`Agent response received: "${response.text}"`);
        addAssistantMessage(
          response.text || "I'm sorry, I couldn't generate a response.",
        );
        setIsLoading(false);
      }
    } catch (error) {
      log(
        `Error during submission: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      addMessage(createErrorMessage(error));
      setIsLoading(false);
    }
  }, [
    inputUtilities,
    isLoading,
    pendingToolCalls.length,
    addUserMessage,
    conversationHistory,
    storePendingCallback,
    addPendingToolCall,
    addAssistantMessage,
    addMessage,
  ]);

  const { input, clearInput, getCurrentInput } = useInputHandling({
    onSubmit: handleSubmit,
    onApproval: handleApprovalWrapper,
    hasPendingToolCalls: pendingToolCalls.length > 0,
    isLoading,
  });

  // Update utilities when they become available
  useEffect(() => {
    setInputUtilities({ getCurrentInput, clearInput });
  }, [getCurrentInput, clearInput]);

  const hasPendingToolCalls = pendingToolCalls.length > 0;

  return (
    <Box flexDirection="column" padding={1}>
      <Header />
      <Messages messages={messages} />
      <ApprovalRequest pendingToolCalls={pendingToolCalls} />
      <InputArea
        input={input}
        isLoading={isLoading}
        hasPendingToolCalls={hasPendingToolCalls}
      />
      <DebugPanel logs={debugLogs} visible={verbose} />
      <HelpText hasPendingToolCalls={hasPendingToolCalls} />
    </Box>
  );
};

export default App;
