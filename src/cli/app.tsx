import { useState, useCallback, useEffect } from "react";
import { Box } from "ink";
import "dotenv/config";
import { RuntimeContext } from "@mastra/core/di";
import { mastra } from "../mastra";
import { AppProps, PendingToolCall } from "./types";
import { createErrorMessage } from "./utils/message-utils";
import { useConversation } from "./hooks/use-conversation";
import { useToolApproval } from "./hooks/use-tool-approval";
import { useInputHandling } from "./hooks/use-input";
import { Header } from "./components/Header";
import { Messages } from "./components/Messages";
import { ApprovalRequest } from "./components/ApprovalRequest";
import { InputArea } from "./components/InputArea";
import { HelpText } from "./components/HelpText";
import { DebugPanel } from "./components/DebugPanel";

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

  const onApprovalSuccess = useCallback(
    (content: string) => {
      log(`Tool approval succeeded, response: "${content}"`);
      addAssistantMessage(content);
      setIsLoading(false);
    },
    [addAssistantMessage],
  );

  const onApprovalError = useCallback(
    (error: string) => {
      log(`Tool approval failed: ${error}`);
      addMessage(createErrorMessage(error));
      setIsLoading(false);
    },
    [addMessage],
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
        onApprovalSuccess,
        onApprovalError,
      );
    },
    [
      handleApproval,
      pendingToolCalls,
      conversationHistory,
      onApprovalSuccess,
      onApprovalError,
    ],
  );

  const [inputUtilities, setInputUtilities] = useState<{
    getCurrentInput: () => string;
    clearInput: () => void;
  } | null>(null);

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

      const response = await agent.generate(currentInput, {
        context: conversationHistory,
        onStepFinish: async ({ toolCalls }) => {
          if (toolCalls && toolCalls.length > 0) {
            log(
              `Agent requested ${toolCalls.length} tool calls: ${toolCalls.map((tc) => tc.toolName).join(", ")}`,
            );
            for (const toolCall of toolCalls) {
              if (toolCall.toolName === "readFileTool") {
                log(
                  `Requesting approval for tool: ${toolCall.toolName} with args: ${JSON.stringify(toolCall.args)}`,
                );
                const callId = `${toolCall.toolName}-${Date.now()}-${Math.random()}`;

                storePendingCallback(callId, async () => {
                  log(`Executing tool: ${toolCall.toolName}`);
                  const tool = tools[toolCall.toolName as keyof typeof tools];
                  const result = await tool.execute({
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
                  message: `Read file: ${toolCall.args.absolutePath}`,
                  callId,
                };

                addPendingToolCall(pendingCall);
                toolCallsToApprove.push(pendingCall);
              }
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
