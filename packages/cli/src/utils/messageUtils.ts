import { Message } from "../types.js";

export const getMessageColor = (type: Message["type"]) => {
  switch (type) {
    case "user":
      return "gray";
    case "assistant":
      return "white";
    case "error":
      return "red";
    default:
      return "blue";
  }
};

export const getMessagePrefix = (type: Message["type"]) => {
  switch (type) {
    case "user":
      return "> ";
    case "assistant":
      return "⏺ ";
    case "error":
      return "❌ Error:";
    default:
      return "";
  }
};

export const createWelcomeMessage = (): Message => ({
  type: "assistant",
  content: `Hello! I'm Clementine. How can I help you today?`,
});

export const createErrorMessage = (error: unknown): Message => ({
  type: "error",
  content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
});
