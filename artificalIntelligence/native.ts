/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 NuzFlameV2 and ItsDenji777
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

interface MistralRequest {
    model: string;
    temperature: number;
    max_tokens: number;
    messages: Array<{
        role: "system" | "user";
        content: string | Array<
            | { type: "text"; text: string; }
            | { type: "image_url"; image_url: string; }
        >;
    }>;
}

export async function complete(_: IpcMainInvokeEvent, apiKey: string, payload: MistralRequest) {
    try {
        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        return {
            status: response.status,
            data: await response.text()
        };
    } catch (error) {
        return {
            status: -1,
            data: error instanceof Error ? error.message : String(error)
        };
    }
}
