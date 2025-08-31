import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdin, useStdout } from "ink";
import "dotenv/config";
import { mastra } from "../mastra";

const agent = mastra.getAgent("clementineAgent");
const tools = await agent.getTools();

interface Message {
  type: "user" | "assistant" | "error";
  content: string;
}

type ConversationHistory = Array<Message>;
type AwaitedTools<T> = T extends Promise<infer U> ? U : T;

interface ApprovalRequest<T> {
  toolCalls: Array<{
    toolName: keyof AwaitedTools<T>;
    args: Record<string, any>;
  }>;
  partialResponse: string;
  context: any;
}

interface AppProps {
  name?: string;
}

const App = ({ name = "User" }: AppProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest<
    typeof tools
  > | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationHistory[]
  >([]);
  const [currentRun, setCurrentRun] = useState<any>(null);
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
      if (!approvalRequest || !currentRun) return;

      try {
        let result;

        if (approve) {
          // Execute all approved tools
          const approvedTools = [];

          for (const toolCall of approvalRequest.toolCalls) {
            const { toolName, args } = toolCall;

            if (tools[toolName]) {
              try {
                const toolResult = await tools[toolName].execute({
                  context: args,
                });
                approvedTools.push({ toolName, result: toolResult });
              } catch (error) {
                const errorMsg = `Tool ${toolName} execution failed: ${error instanceof Error ? error.message : "Unknown error"}`;
                const errorMessage: Message = {
                  type: "error",
                  content: errorMsg,
                };

                setMessages((prev) => [...prev, errorMessage]);
                setApprovalRequest(null);
                setCurrentRun(null);
                setIsLoading(false);
                return;
              }
            } else {
              const errorMessage: Message = {
                type: "error",
                content: `Tool ${toolName} not found`,
              };

              setMessages((prev) => [...prev, errorMessage]);
              setApprovalRequest(null);
              setCurrentRun(null);
              setIsLoading(false);
              return;
            }
          }

          // Resume with approval and tool results
          result = await currentRun.resume({
            step: "conversation", // Specify which step to resume
            resumeData: {
              approved: true,
              approvedTools,
            },
          });
        } else {
          // Resume with rejection
          result = await currentRun.resume({
            step: "conversation", // Specify which step to resume
            resumeData: { approved: false },
          });
        }

        // Clear the approval request
        setApprovalRequest(null);

        // Handle the workflow result
        if (result.status === "success" && result.result?.response) {
          const assistantMessage: Message = {
            type: "assistant",
            content: result.result.response,
          };

          setMessages((prev) => [...prev, assistantMessage]);
          setConversationHistory((prev) => [
            ...prev,
            { role: "assistant", content: result.result.response },
          ]);
        } else if (result.status === "failed") {
          const errorMessage: Message = {
            type: "error",
            content: `Error: ${result.error || "Workflow execution failed"}`,
          };

          setMessages((prev) => [...prev, errorMessage]);
        }

        setCurrentRun(null);
      } catch (error) {
        console.error("Failed to resume workflow:", error);
        const errorMessage: Message = {
          type: "error",
          content: `Failed to process approval: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
        setApprovalRequest(null);
        setCurrentRun(null);
      }

      setIsLoading(false);
    },
    [approvalRequest, currentRun],
  );

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading || approvalRequest) return;

    const userMessage: Message = {
      type: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setConversationHistory((prev) => [
      ...prev,
      { role: "user", content: input.trim() },
    ]);
    setInput("");
    setIsLoading(true);

    try {
      // Get the conversation workflow
      const workflow = mastra.getWorkflow("conversation-workflow");
      const run = await workflow.createRunAsync();
      setCurrentRun(run);

      // Start the workflow
      const result = await run.start({
        inputData: {
          userInput: input.trim(),
          conversationHistory,
        },
      });

      if (result.status === "suspended") {
        // Extract approval details from suspension
        const suspendedStep = result.steps?.conversation;
        if (suspendedStep?.suspendPayload) {
          const { toolCalls, partialResponse, context } =
            suspendedStep.suspendPayload;

          setApprovalRequest({
            toolCalls,
            partialResponse: partialResponse || "",
            context,
          });

          // Don't set loading to false yet - we're waiting for approval
          return;
        }
      }

      // Handle successful completion without tool approval needed
      if (result.status === "success" && result.result?.response) {
        const assistantMessage: Message = {
          type: "assistant",
          content: result.result.response,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setConversationHistory((prev) => [
          ...prev,
          { role: "assistant", content: result.result.response },
        ]);
      } else if (result.status === "failed") {
        // Handle failure
        const errorMessage: Message = {
          type: "error",
          content: `Error: ${result.error || "Workflow execution failed"}`,
        };

        setMessages((prev) => [...prev, errorMessage]);
      }

      setCurrentRun(null);
    } catch (error) {
      const errorMessage: Message = {
        type: "error",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
      };

      setMessages((prev) => [...prev, errorMessage]);
      setCurrentRun(null);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, conversationHistory, approvalRequest]);

  // Handle keyboard input
  useInput((input, key) => {
    if (approvalRequest) {
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

  // Enable raw mode to handle Ctrl+C
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
          <Box key={`${index}`} marginBottom={1}>
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
      {isLoading && !approvalRequest && (
        <Box marginBottom={1}>
          <Text color="yellow">🤔 Thinking...</Text>
        </Box>
      )}

      {/* Approval request */}
      {approvalRequest && (
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

          {/* Show partial response if available */}
          {approvalRequest.partialResponse && (
            <Box marginTop={1} marginBottom={1}>
              <Text color="gray">
                Response: {approvalRequest.partialResponse}
              </Text>
            </Box>
          )}

          {/* List all tools that need approval */}
          <Box marginTop={1} marginBottom={1} flexDirection="column">
            <Text color="cyan" bold>
              Tools to execute:
            </Text>
            {approvalRequest.toolCalls.map((toolCall, index) => (
              <Box key={index} marginLeft={2}>
                <Text color="cyan">• {toolCall.toolName}</Text>
                <Text color="gray"> - {JSON.stringify(toolCall.args)}</Text>
              </Box>
            ))}
          </Box>

          <Box>
            <Text color="green">Press Y/Enter to approve all tools, </Text>
            <Text color="red">N/Esc to reject</Text>
          </Box>
        </Box>
      )}

      {/* Input area - only show if no approval request */}
      {!approvalRequest && (
        <Box>
          <Text color="gray">{"> "}</Text>
          <Text>{input}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}

      {/* Help text */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {approvalRequest
            ? "Waiting for approval decision..."
            : "Type your message and press Enter to send. Press Ctrl+C to exit."}
        </Text>
      </Box>
    </Box>
  );
};

export default App;
