import { useState, useEffect, useCallback } from "react";
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

  // Add welcome message on mount
  useEffect(() => {
    const welcomeMessage: Message = {
      type: "assistant",
      content: `Hello ${name}! I'm Clementine, your AI assistant. How can I help you today?`,
    };
    setMessages([welcomeMessage]);
  }, [name]);

  const handleApproval = useCallback(
    async (approve: boolean) => {
      if (pendingToolCalls.length === 0) return;

      try {
        if (approve) {
          // Execute all approved tools
          const toolResults = [];
          for (const toolCall of pendingToolCalls) {
            try {
              const callback = pendingCallbacks.get(toolCall.callId);
              if (callback) {
                const result = await callback();
                toolResults.push({ toolName: toolCall.toolName, result });
                pendingCallbacks.delete(toolCall.callId); // Cleanup
              }
            } catch (error) {
              const errorMsg = `Tool ${toolCall.toolName} failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`;
              setMessages((prev) => [
                ...prev,
                { type: "error", content: errorMsg },
              ]);
              setPendingToolCalls([]);
              setIsLoading(false);
              return;
            }
          }

          // Now call the agent again with the tool results
          const toolResultsContext = toolResults
            .map(
              (tr) =>
                `Tool ${tr.toolName} result: ${JSON.stringify(tr.result, null, 2)}`,
            )
            .join("\n");

          const contextPrompt = `The user asked: "${input.trim()}"\n\nTool results:\n${toolResultsContext}\n\nPlease provide a helpful response based on these results.`;

          const response = await agent.generate(contextPrompt, {
            context: conversationHistory,
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
        pendingToolCalls.forEach((call) =>
          pendingCallbacks.delete(call.callId),
        );
        setPendingToolCalls([]);
      } catch (error) {
        const errorMessage: Message = {
          type: "error",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
        setMessages((prev) => [...prev, errorMessage]);

        // Cleanup callbacks on error too
        pendingToolCalls.forEach((call) =>
          pendingCallbacks.delete(call.callId),
        );
        setPendingToolCalls([]);
      }

      setIsLoading(false);
    },
    [pendingToolCalls, conversationHistory, input],
  );

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading || pendingToolCalls.length > 0) return;

    const userMessage: Message = {
      type: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setConversationHistory((prev) => [
      ...prev,
      { role: "user", content: input.trim() },
    ]);

    const currentInput = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      const tools = await agent.getTools();
      let toolCallsToApprove: PendingToolCall[] = [];

      const response = await agent.generate(currentInput, {
        context: conversationHistory,
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
  }, [input, isLoading, conversationHistory, pendingToolCalls]);

  // Handle keyboard input
  useInput((input, key) => {
    if (pendingToolCalls.length > 0) {
      if (key.return || input.toLowerCase() === "y") {
        handleApproval(true);
      } else if (key.escape || input.toLowerCase() === "n") {
        handleApproval(false);
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
