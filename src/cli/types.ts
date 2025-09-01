export interface Message {
  type: "user" | "assistant" | "error";
  content: string;
}

export interface PendingToolCall {
  toolName: string;
  args: Record<string, any>;
  message: string;
  callId: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AppProps {
  name?: string;
  verbose?: boolean;
}