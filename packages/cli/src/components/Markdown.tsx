import { marked } from "marked";
import { Text } from "ink";
import TerminalRenderer, { TerminalRendererOptions } from "marked-terminal";

export type Props = TerminalRendererOptions & {
  children: string;
};

const Markdown = ({ children, ...options }: Props) => {
  marked.setOptions({ renderer: new TerminalRenderer(options) as any });
  return <Text>{marked.parse(children, { async: false }).trim()}</Text>;
};

export default Markdown;
