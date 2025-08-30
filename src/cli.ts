import "dotenv/config";

import { mastra } from "./mastra";

const agent = mastra.getAgent("clementineAgent");
const response = await agent.generate(
  "Read this file '/Users/dchae/github-dchae/clementine/README.md'",
);
console.log(response.text);
