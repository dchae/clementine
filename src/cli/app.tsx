import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import "dotenv/config";
import { mastra } from "../mastra";

const agent = mastra.getAgent("clementineAgent");

interface Message {
  type: "user" | "assistant" | "error";
  content: string;
}

interface PendingToolCall {
  toolName: string;
  args: Record<string, any>;
  message: string;
  callId: string;
}

// Store callbacks outside React state since they can't be serialized
const pendingCallbacks = new Map<string, () => Promise<any>>();

interface AppProps {
  name?: string;
}

const App = ({ name = "User" }: AppProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>(
    [],
  );
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const { stdin, setRawMode } = useStdin();

  // Use refs to avoid dependency issues
  const conversationHistoryRef = useRef(conversationHistory);
  const currentInputRef = useRef("");
  const pendingToolCallsRef = useRef(pendingToolCalls);
  const isLoadingRef = useRef(isLoading);

  // Keep refs in sync with state
  useEffect(() => {
    conversationHistoryRef.current = conversationHistory;
  }, [conversationHistory]);

  useEffect(() => {
    currentInputRef.current = input;
  }, [input]);

  useEffect(() => {
    pendingToolCallsRef.current = pendingToolCalls;
  }, [pendingToolCalls]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Add welcome message on mount
  useEffect(() => {
    const welcomeMessage: Message = {
      type: "assistant",
      content: `Hello ${name}! I'm Clementine, your AI assistant. How can I help you today?`,
    };
    setMessages([welcomeMessage]);
  }, [name]);

  const handleApproval = useCallback(
    async (approve: boolean, currentPendingCalls: PendingToolCall[]) => {
      if (currentPendingCalls.length === 0) return;

      // Clear the approval UI immediately
      setPendingToolCalls([]);

      try {
        if (approve) {
          // Execute all approved tools in parallel
          const toolPromises = currentPendingCalls.map(async (toolCall) => {
            const callback = pendingCallbacks.get(toolCall.callId);
            if (callback) {
              try {
                const result = await callback();
                pendingCallbacks.delete(toolCall.callId); // Cleanup
                return { toolName: toolCall.toolName, result, success: true };
              } catch (error) {
                pendingCallbacks.delete(toolCall.callId); // Cleanup
                return {
                  toolName: toolCall.toolName,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
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

          // Check for any failures
          const failedTools = allResults.filter((result) => !result.success);
          if (failedTools.length > 0) {
            const errorMsg = `Tools failed: ${failedTools.map((t) => `${t.toolName} (${t.error})`).join(", ")}`;
            setMessages((prev) => [
              ...prev,
              { type: "error", content: errorMsg },
            ]);
            setIsLoading(false);
            return;
          }

          // Filter to only successful results for context
          const toolResults = allResults.filter((result) => result.success);

          // Now call the agent again with the tool results
          const toolResultsContext = toolResults
            .map(
              (tr) =>
                `Tool ${tr.toolName} result: ${JSON.stringify(tr.result, null, 2)}`,
            )
            .join("\n");

          const contextPrompt = `The user asked: "${currentInputRef.current.trim()}"\n\nTool results:\n${toolResultsContext}\n\nPlease provide a helpful response based on these results.`;

          const response = await agent.generate(contextPrompt, {
            context: conversationHistoryRef.current,
          });

          const assistantMessage: Message = {
            type: "assistant",
            content: response.text || "I've processed your request.",
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setConversationHistory((prev) => [
            ...prev,
            { role: "assistant", content: response.text || "" },
          ]);
        } else {
          // User rejected
          const rejectionMessage: Message = {
            type: "assistant",
            content:
              "I understand. Let me know if there's another way I can help.",
          };
          setMessages((prev) => [...prev, rejectionMessage]);
        }

        // Cleanup callbacks
        currentPendingCalls.forEach((call) =>
          pendingCallbacks.delete(call.callId),
        );
      } catch (error) {
        const errorMessage: Message = {
          type: "error",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
        setMessages((prev) => [...prev, errorMessage]);

        // Cleanup callbacks on error too
        currentPendingCalls.forEach((call) =>
          pendingCallbacks.delete(call.callId),
        );
      }

      setIsLoading(false);
    },
    [], // No dependencies - we pass data as parameters
  );

  const handleSubmit = useCallback(
    async () => {
      if (
        !currentInputRef.current.trim() ||
        isLoadingRef.current ||
        pendingToolCallsRef.current.length > 0
      )
        return;

      const userMessage: Message = {
        type: "user",
        content: currentInputRef.current.trim(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setConversationHistory((prev) => [
        ...prev,
        { role: "user", content: currentInputRef.current.trim() },
      ]);

      const currentInput = currentInputRef.current.trim();
      setInput("");
      setIsLoading(true);

      try {
        const tools = await agent.getTools();
        let toolCallsToApprove: PendingToolCall[] = [];

        const response = await agent.generate(currentInput, {
          context: conversationHistoryRef.current,
          onStepFinish: async ({ toolCalls, text }) => {
            if (toolCalls && toolCalls.length > 0) {
              // For readFileTool, always require approval (for now)
              for (const toolCall of toolCalls) {
                if (toolCall.toolName === "readFileTool") {
                  const callId = `${toolCall.toolName}-${Date.now()}-${Math.random()}`;

                  // Store the tool execution function (capture toolCall in closure)
                  pendingCallbacks.set(callId, async () => {
                    const tool = tools[toolCall.toolName];
                    return await tool.execute({
                      context: toolCall.args,
                      mastra,
                    });
                  });

                  toolCallsToApprove.push({
                    toolName: toolCall.toolName,
                    args: toolCall.args,
                    message: `Read file: ${toolCall.args.absolutePath}`,
                    callId,
                  });
                }
              }

              if (toolCallsToApprove.length > 0) {
                setPendingToolCalls(toolCallsToApprove);
                return; // Don't continue - wait for approval
              }
            }
          },
        });

        // If no approval needed, show response directly
        if (toolCallsToApprove.length === 0) {
          const assistantMessage: Message = {
            type: "assistant",
            content:
              response.text || "I'm sorry, I couldn't generate a response.",
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setConversationHistory((prev) => [
            ...prev,
            { role: "assistant", content: response.text || "" },
          ]);
          setIsLoading(false);
        }
      } catch (error) {
        const errorMessage: Message = {
          type: "error",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
      }
    },
    [], // No dependencies - using refs
  );

  // Handle keyboard input
  useInput((input, key) => {
    if (pendingToolCalls.length > 0) {
      if (key.return || input.toLowerCase() === "y") {
        handleApproval(true, pendingToolCalls);
      } else if (key.escape || input.toLowerCase() === "n") {
        handleApproval(false, pendingToolCalls);
      }
      return;
    }

    // Normal input handling
    if (key.return) {
      handleSubmit();
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (key.ctrl && input.toLowerCase() === "c") {
      process.exit(0);
    } else if (input) {
      setInput((prev) => prev + input);
    }
  });

  // Enable raw mode
  useEffect(() => {
    if (stdin) {
      setRawMode(true);
    }
    return () => {
      if (stdin) {
        setRawMode(false);
      }
    };
  }, [stdin, setRawMode]);

  const getMessageColor = (type: Message["type"]) => {
    switch (type) {
      case "user":
        return "blue";
      case "assistant":
        return "green";
      case "error":
        return "red";
      default:
        return "white";
    }
  };

  const getMessagePrefix = (type: Message["type"]) => {
    switch (type) {
      case "user":
        return "You:";
      case "assistant":
        return "Clementine:";
      case "error":
        return "❌ Error:";
      default:
        return "";
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          🍊 Clementine
        </Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((message, index) => (
          <Box key={index} marginBottom={1}>
            <Box flexDirection="column">
              <Text color={getMessageColor(message.type)} bold>
                {getMessagePrefix(message.type)}
              </Text>
              <Text color={getMessageColor(message.type)}>
                {message.content}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Loading indicator */}
      {isLoading && pendingToolCalls.length === 0 && (
        <Box marginBottom={1}>
          <Text color="yellow">🤔 Thinking...</Text>
        </Box>
      )}

      {/* Approval request */}
      {pendingToolCalls.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          padding={1}
          marginBottom={1}
        >
          <Text color="yellow" bold>
            🔐 Tool Execution Approval Required
          </Text>

          {/* List tools that need approval */}
          <Box marginTop={1} marginBottom={1} flexDirection="column">
            <Text color="cyan" bold>
              Tools to execute:
            </Text>
            {pendingToolCalls.map((toolCall, index) => (
              <Box key={index} marginLeft={2}>
                <Text color="cyan">• {toolCall.message}</Text>
              </Box>
            ))}
          </Box>

          <Box>
            <Text color="green">Press Y/Enter to approve, </Text>
            <Text color="red">N/Esc to reject</Text>
          </Box>
        </Box>
      )}

      {/* Input area - only show if no approval request */}
      {pendingToolCalls.length === 0 && (
        <Box>
          <Text color="gray">{"> "}</Text>
          <Text>{input}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}

      {/* Help text */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {pendingToolCalls.length > 0
            ? "Waiting for approval decision..."
            : "Type your message and press Enter to send. Press Ctrl+C to exit."}
        </Text>
      </Box>
    </Box>
  );
};

export default App;
