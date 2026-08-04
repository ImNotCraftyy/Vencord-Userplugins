/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Vencord port of Kaan's BetterDiscord Quoter plugin.

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { IconProps, OptionType } from "@utils/types";
import { CloudUpload as CloudUploadType, Message } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findLazy } from "@webpack";
import { ChannelStore, Constants, FluxDispatcher, GuildMemberStore, Menu, MessageActions, PendingReplyStore, RestAPI, showToast, SnowflakeUtils, Toasts } from "@webpack/common";

const CloudUpload: typeof CloudUploadType = findLazy(module => module.prototype?.trackUploadFinished);
const quotesInProgress = new Set<string>();

function QuoteIcon({ height = 18, width = 18, className }: IconProps) {
    return (
        <svg
            aria-hidden="true"
            className={className}
            fill="currentColor"
            height={height}
            viewBox="0 0 24 24"
            width={width}
        >
            <path d="M9 17H3v-6a6 6 0 0 1 6-6v3a3 3 0 0 0-3 3h3v6Zm12 0h-6v-6a6 6 0 0 1 6-6v3a3 3 0 0 0-3 3h3v6Z" />
        </svg>
    );
}

const settings = definePluginSettings({
    username: {
        type: OptionType.SELECT,
        description: "Changes the name shown under the quote.",
        options: [
            { label: "Username", value: "username", default: true },
            { label: "Global Name", value: "globalName" },
            { label: "Server Nickname", value: "serverNickname" }
        ]
    }
});

function calculateFontSize(charCount: number, width: number, height: number) {
    let baseSize = charCount <= 20
        ? 48
        : charCount <= 50
            ? 36
            : charCount <= 100
                ? 28
                : charCount <= 200
                    ? 22
                    : 18;

    const charsPerLine = Math.max(1, Math.floor(width / (baseSize * 0.6)));
    const estimatedLines = Math.ceil(charCount / charsPerLine);
    const requiredHeight = estimatedLines * baseSize * 1.2;

    if (requiredHeight > height * 0.8)
        baseSize *= height * 0.8 / requiredHeight;

    return Math.max(16, Math.min(baseSize, 60));
}

function loadImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load the user's avatar."));
        image.src = url;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create the quote image."));
        }, "image/png");
    });
}

function wrapTextCentered(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
) {
    const lines: string[] = [];

    for (const paragraph of text.split("\n")) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        let line = "";

        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && context.measureText(candidate).width > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }

        if (line) lines.push(line);
        else if (!words.length) lines.push("");
    }

    const startY = y - lines.length * lineHeight / 2 + lineHeight;
    lines.forEach((line, index) => {
        const lineWidth = context.measureText(line).width;
        context.fillText(line, x + (maxWidth - lineWidth) / 2, startY + index * lineHeight);
    });

    return startY + lines.length * lineHeight;
}

async function generateQuoteImage(imageUrl: string, text: string, attribution: string, width = 1250, height = 530) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch the avatar (${response.status}).`);

    const objectUrl = URL.createObjectURL(await response.blob());

    try {
        const image = await loadImage(objectUrl);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");

        context.fillStyle = "black";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, 600, height);

        const gradient = context.createLinearGradient(0, 45, 530, 0);
        gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);

        const availableWidth = 400;
        const fontSize = calculateFontSize(text.length, availableWidth, height);
        const lineHeight = fontSize * 1.2;
        const centerX = 650;

        context.fillStyle = "white";
        context.font = `bold ${fontSize}px Arial`;
        const endY = wrapTextCentered(context, text, centerX, height / 2, availableWidth, lineHeight);

        context.fillStyle = "rgb(104, 104, 104)";
        context.font = "italic 20px Arial";
        const attributionText = `- @${attribution}`;
        const attributionX = centerX + (availableWidth - context.measureText(attributionText).width) / 2;
        context.fillText(attributionText, attributionX, endY + 5);

        return await canvasToBlob(canvas);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function getAttribution(message: Message, guildId?: string) {
    const { author } = message;

    switch (settings.store.username) {
        case "globalName":
            return author.globalName || author.username;
        case "serverNickname":
            return (guildId && GuildMemberStore.getMember(guildId, author.id)?.nick)
                || author.globalName
                || author.username;
        default:
            return author.username;
    }
}

async function uploadQuote(message: Message, guildId?: string) {
    const channelId = message.channel_id;
    const avatarUrl = message.author.getAvatarURL(null, 4096, false);
    const attribution = getAttribution(message, guildId);
    const quoteBlob = await generateQuoteImage(avatarUrl, message.content, attribution);
    const file = new File([quoteBlob], "quote.png", { type: "image/png" });
    const reply = PendingReplyStore.getPendingReply(channelId);
    const replyOptions = MessageActions.getSendMessageOptionsForReply(reply);

    const upload = new CloudUpload({
        file,
        isThumbnail: false,
        platform: CloudUploadPlatform.WEB
    }, channelId);

    await new Promise<void>((resolve, reject) => {
        upload.on("complete", resolve);
        upload.on("error", reject);
        void upload.upload();
    });

    await RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body: {
            flags: 0,
            channel_id: channelId,
            content: "",
            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
            sticker_ids: [],
            type: 0,
            attachments: [{
                id: "0",
                filename: upload.filename,
                uploaded_filename: upload.uploadedFilename
            }],
            message_reference: replyOptions?.messageReference ?? null
        }
    });

    if (replyOptions?.messageReference)
        FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
}

async function quoteAndSend(message: Message, guildId?: string) {
    if (!message.content.trim()) {
        showToast("No Text Detected", Toasts.Type.FAILURE);
        return;
    }

    if (quotesInProgress.has(message.id)) {
        showToast("That Quote Is Already Being Generated", Toasts.Type.MESSAGE);
        return;
    }

    quotesInProgress.add(message.id);
    showToast("Generating Quote", Toasts.Type.MESSAGE);

    try {
        await uploadQuote(message, guildId);
        showToast("Quote Sent", Toasts.Type.SUCCESS);
    } catch (error) {
        console.error("[Quoter] Failed to create quote", error);
        showToast("Failed to Create or Upload the Quote", Toasts.Type.FAILURE);
    } finally {
        quotesInProgress.delete(message.id);
    }
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props: { message?: Message; channel?: { guild_id?: string; }; }) => {
    const { message } = props;
    if (!message) return;

    children.push(
        <Menu.MenuItem
            id="vc-quoter-quote-user"
            label="Quote User"
            icon={QuoteIcon}
            action={() => quoteAndSend(message, props.channel?.guild_id)}
        />
    );
};

export default definePlugin({
    name: "Quoter",
    description: "Right click a message to quote your friends' wild statements.",
    tags: ["Chat", "Fun"],
    authors: [{
        name: "NuzFlameV2",
        id: 1248366351194652712n
    }],
    settings,
    contextMenus: {
        message: messageContextMenuPatch
    },
    messagePopoverButton: {
        icon: QuoteIcon,
        render(message: Message) {
            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return null;

            return {
                label: "Quote User",
                icon: QuoteIcon,
                message,
                channel,
                onClick: () => quoteAndSend(message, channel.guild_id)
            };
        }
    }
});
