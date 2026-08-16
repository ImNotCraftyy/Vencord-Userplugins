/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandOptionType } from "@api/Commands";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "FakeForwardText",
    description: "Sends a message formatted to look like a forwarded message.",
    authors: [{ name: "You", id: 0n }], // Feel free to put your own name and ID here!
    tags: ["Chat", "Fun"],

    commands: [{
        name: "fakeforward",
        description: "Send a fake forwarded text message",
        options: [
            {
                name: "text",
                description: "The text you want to fake-forward",
                type: ApplicationCommandOptionType.STRING,
                required: true
            }
        ],
        execute(args, ctx) {
            // Get the text the user typed
            const text = args.find(a => a.name === "text")?.value as string;
            
            if (!text) return;

            // Split by \n so you can do multi-line messages!
            // Example: /fakeforward Line 1 \n Line 2
            const formattedLines = text
                .split("\\n") 
                .map(line => `> ### ${line.trim()}`)
                .join("\n");

            // Combine the fake forward header with the user's text
            const forwardedMessage = `> -# ↪  ***Forwarded***\n${formattedLines}`;

            // Send it!
            return {
                content: forwardedMessage
            };
        }
    }]
});