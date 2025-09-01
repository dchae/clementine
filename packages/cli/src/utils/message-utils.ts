import { Message } from "../types.js";

export const getMessageColor = (type: Message["type"]) => {
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

export const getMessagePrefix = (type: Message["type"]) => {
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

export const createWelcomeMessage = (name: string): Message => ({
  type: "assistant",
  content: `Hello ${name}! I'm Clementine, your AI assistant. How can I help you today?`,
});

export const createErrorMessage = (error: unknown): Message => ({
  type: "error",
  content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
});