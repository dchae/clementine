import "dotenv/config";

import { mastra } from "./mastra";

const agent = mastra.getAgent("clementineAgent");
const response = await agent.stream(
  "What is this file '/Users/dchae/github-dchae/clementine/package.json'?",
);
console.log(response.text);
