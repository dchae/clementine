import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdin, useStdout } from "ink";
import "dotenv/config";
import { mastra } from "../mastra";

interface Message {
  id: number;
  type: "user" | "assistant" | "error";
  content: string;
  timestamp: Date;
}

interface AppProps {
  name?: string;
}

export default function App({ name = "User" }: AppProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messageIdCounter, setMessageIdCounter] = useState(0);

  const { stdin, setRawMode } = useStdin();
  const { stdout } = useStdout();

  const agent = mastra.getAgent("clementineAgent");

  // Add welcome message on mount
  useEffect(() => {
    const welcomeMessage: Message = {
      id: 0,
      type: "assistant",
      content: `Hello ${name}! I'm Clementine, your AI assistant. How can I help you today?`,
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
    setMessageIdCounter(1);
  }, [name]);

  // Handle input submission
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: messageIdCounter,
      type: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessageIdCounter((prev) => prev + 1);
    setInput("");
    setIsLoading(true);

    try {
      const response = await agent.generate(input.trim());

      const assistantMessage: Message = {
        id: messageIdCounter + 1,
        type: "assistant",
        content: response.text || "I'm sorry, I couldn't generate a response.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setMessageIdCounter((prev) => prev + 2);
    } catch (error) {
      const errorMessage: Message = {
        id: messageIdCounter + 1,
        type: "error",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      setMessageIdCounter((prev) => prev + 2);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messageIdCounter, agent]);

  // Handle keyboard input
  useInput((input, key) => {
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

  // Enable raw mode for better input handling
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
        return "👤 You:";
      case "assistant":
        return "🤖 Clementine:";
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
          🍊 Clementine CLI
        </Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((message) => (
          <Box key={message.id} marginBottom={1}>
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
      {isLoading && (
        <Box marginBottom={1}>
          <Text color="yellow">🤔 Thinking...</Text>
        </Box>
      )}

      {/* Input area */}
      <Box>
        <Text color="gray">{"> "}</Text>
        <Text>{input}</Text>
        <Text color="gray">█</Text>
      </Box>

      {/* Help text */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Type your message and press Enter to send. Press Ctrl+C to exit.
        </Text>
      </Box>
    </Box>
  );
}
