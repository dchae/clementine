import { Box, Text } from "ink";
import { Message } from "../types.js";
import Markdown from "./Markdown.js";
import { getMessageColor, getMessagePrefix } from "../utils/messageUtils.js";

interface MessagesProps {
  messages: Message[];
}

export const Messages = ({ messages }: MessagesProps) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {messages.map((message, index) => (
        <Box key={index} marginBottom={1}>
          <Box flexDirection="column">
            <Text color={getMessageColor(message.type)} bold>
              {getMessagePrefix(message.type)}
              <Markdown>{message.content}</Markdown>
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};
