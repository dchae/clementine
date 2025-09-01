import { useState, useEffect, useCallback } from "react";
import { Message, ConversationMessage } from "../types.js";
import { createWelcomeMessage } from "../utils/message-utils.js";

export const useConversation = (userName: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);

  // Add welcome message on mount
  useEffect(() => {
    const welcomeMessage = createWelcomeMessage(userName);
    setMessages([welcomeMessage]);
  }, [userName]);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const addConversationEntry = useCallback((entry: ConversationMessage) => {
    setConversationHistory(prev => [...prev, entry]);
  }, []);

  const addUserMessage = useCallback((content: string) => {
    const userMessage: Message = { type: "user", content };
    addMessage(userMessage);
    addConversationEntry({ role: "user", content });
  }, [addMessage, addConversationEntry]);

  const addAssistantMessage = useCallback((content: string) => {
    const assistantMessage: Message = { type: "assistant", content };
    addMessage(assistantMessage);
    addConversationEntry({ role: "assistant", content });
  }, [addMessage, addConversationEntry]);

  return {
    messages,
    conversationHistory,
    addMessage,
    addUserMessage,
    addAssistantMessage,
  };
};