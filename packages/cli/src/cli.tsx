#!/usr/bin/env node
import { render } from "ink";
import meow from "meow";
import App from "./app.js";

const cli = meow(
  `
		Usage
		  $ clementine

		Options
			--verbose, -v  Show detailed output
			--help  Show help

		Examples
		  $ clementine --verbose
	`,
  {
    importMeta: import.meta,
    flags: {
      verbose: {
        type: "boolean",
        shortFlag: "v",
        default: false,
      },
      help: {
        type: "boolean",
        shortFlag: "h",
      },
    },
  },
);

// Handle help flag
if (cli.flags.help) {
  cli.showHelp();
  process.exit(0);
}

render(<App verbose={cli.flags.verbose} />);
