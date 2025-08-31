#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import meow from "meow";
import App from "./app.js";

const cli = meow(
  `
		Usage
		  $ clementine

		Options
			--name  Your name

		Examples
		  $ clementine --name=Jane
		  Hello, Jane
	`,
  {
    importMeta: import.meta,
    flags: {
      name: {
        type: "string",
        shortFlag: "n",
      },
    },
  },
);

render(<App name={cli.flags.name} />);
