/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Vencord port of Kaan's BetterDiscord Quoter plugin.

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { sendMessage } from "@utils/discord";
import definePlugin, { IconProps } from "@utils/types";
import { CloudUpload as CloudUploadType, Message } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, GuildMemberStore, GuildRoleStore, Menu, MessageActions, PendingReplyStore, showToast, Toasts, UserStore } from "@webpack/common";

const CloudUpload: typeof CloudUploadType = findLazy(module => module.prototype?.trackUploadFinished);
const quotesInProgress = new Set<string>();
const CODE_BLOCK_MARKER = "\uE000";

interface TextStyle {
    bold: boolean;
    code: boolean;
    italic: boolean;
    strike: boolean;
    underline: boolean;
}

interface TextRun {
    style: TextStyle;
    text: string;
}

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

function calculateFontSize(charCount: number, width: number, height: number) {
    let baseSize = charCount <= 30
        ? 52
        : charCount <= 80
            ? 42
            : charCount <= 160
                ? 34
                : charCount <= 300
                    ? 28
                    : 22;

    const charsPerLine = Math.max(1, Math.floor(width / (baseSize * 0.56)));
    const estimatedLines = Math.ceil(charCount / charsPerLine);
    const requiredHeight = estimatedLines * baseSize * 1.28;

    if (requiredHeight > height)
        baseSize *= height / requiredHeight;

    return Math.max(18, Math.min(baseSize, 54));
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

function formatTimestamp(seconds: string, format = "f") {
    const date = new Date(Number(seconds) * 1000);
    if (Number.isNaN(date.getTime())) return "Invalid Date";

    if (format === "R") {
        const delta = date.getTime() - Date.now();
        const units = [
            ["year", 31_536_000_000],
            ["month", 2_592_000_000],
            ["week", 604_800_000],
            ["day", 86_400_000],
            ["hour", 3_600_000],
            ["minute", 60_000],
            ["second", 1_000]
        ] as const;
        const [unit, milliseconds] = units.find(([, size]) => Math.abs(delta) >= size) ?? units.at(-1)!;
        return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(delta / milliseconds), unit);
    }

    const options: Record<string, Intl.DateTimeFormatOptions> = {
        t: { hour: "numeric", minute: "2-digit" },
        T: { hour: "numeric", minute: "2-digit", second: "2-digit" },
        d: { year: "numeric", month: "2-digit", day: "2-digit" },
        D: { year: "numeric", month: "long", day: "numeric" },
        f: { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" },
        F: { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }
    };

    return new Intl.DateTimeFormat(undefined, options[format] ?? options.f).format(date);
}

function resolveDiscordMarkdown(content: string, guildId?: string) {
    let text = content
        .replace(/\\([-\\*~_|>`#])/g, (_, character: string) => `\uE100${character.codePointAt(0)!.toString(16)}\uE101`)
        .replace(/```(?:[\w+-]+)?\n?([\s\S]*?)```/g, `${CODE_BLOCK_MARKER}$1${CODE_BLOCK_MARKER}`)
        .replace(/\[([^\]]+)]\(<?[^)\s>]+>?\)/g, "$1")
        .replace(/<@&([0-9]+)>/g, (_, id: string) => {
            const role = guildId ? GuildRoleStore.getRole(guildId, id) : undefined;
            return `@${role?.name ?? "deleted-role"}`;
        })
        .replace(/<@!?([0-9]+)>/g, (_, id: string) => {
            const user = UserStore.getUser(id);
            return `@${user?.globalName || user?.username || "unknown-user"}`;
        })
        .replace(/<#([0-9]+)>/g, (_, id: string) => `#${ChannelStore.getChannel(id)?.name ?? "unknown-channel"}`)
        .replace(/<t:([0-9]+)(?::([tTdDfFR]))?>/g, (_, seconds: string, format?: string) => formatTimestamp(seconds, format))
        .replace(/<a?:([\w~]+):[0-9]+>/g, ":$1:")
        .replace(/<\/([^:>]+):[0-9]+>/g, "/$1")
        .replace(/<(https?:\/\/[^>]+)>/g, "$1")
        .replace(/^>>>\s?/m, "")
        .replace(/^#{1,3}\s+/gm, "")
        .replace(/^-#\s+/gm, "")
        .replace(/^>\s?/gm, "")
        .replace(/^\s*[-+*]\s+/gm, "• ");

    text = text.replace(/\uE100([0-9a-f]+)\uE101/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
    return text.trim();
}

function parseStyledText(text: string): TextRun[] {
    const runs: TextRun[] = [];
    const style: TextStyle = { bold: false, code: false, italic: false, strike: false, underline: false };
    const activeMarkers = new Set<string>();
    let buffer = "";

    const flush = () => {
        if (!buffer) return;
        runs.push({ text: buffer, style: { ...style } });
        buffer = "";
    };

    const markers = [
        { token: CODE_BLOCK_MARKER, toggle: ["code"] as const },
        { token: "***", toggle: ["bold", "italic"] as const },
        { token: "**", toggle: ["bold"] as const },
        { token: "__", toggle: ["underline"] as const },
        { token: "~~", toggle: ["strike"] as const },
        { token: "||", toggle: [] as const },
        { token: "`", toggle: ["code"] as const },
        { token: "*", toggle: ["italic"] as const },
        { token: "_", toggle: ["italic"] as const }
    ];

    for (let index = 0; index < text.length;) {
        if (text[index] === "\\" && index + 1 < text.length) {
            buffer += text[index + 1];
            index += 2;
            continue;
        }

        const marker = markers.find(({ token }) => {
            if (!text.startsWith(token, index)) return false;
            if (activeMarkers.has(token)) return true;
            if (!text.includes(token, index + token.length)) return false;

            if ((token === "_" || token === "*") && /[\p{L}\p{N}]/u.test(text[index - 1] ?? ""))
                return false;

            return true;
        });

        if (!marker) {
            buffer += text[index++];
            continue;
        }

        flush();
        const enabled = !activeMarkers.has(marker.token);
        if (enabled) activeMarkers.add(marker.token);
        else activeMarkers.delete(marker.token);

        for (const key of marker.toggle)
            style[key] = enabled;

        index += marker.token.length;
    }

    flush();
    return runs;
}

function setRunFont(context: CanvasRenderingContext2D, style: TextStyle, fontSize: number, fontFamily: string) {
    const family = style.code ? "Consolas, monospace" : fontFamily;
    const size = style.code ? fontSize * 0.88 : fontSize;
    context.font = `${style.italic ? "italic " : ""}${style.bold ? "700 " : "400 "}${size}px ${family}`;
}

function drawStyledTextCentered(
    context: CanvasRenderingContext2D,
    runs: TextRun[],
    centerX: number,
    centerY: number,
    maxWidth: number,
    fontSize: number,
    fontFamily: string
) {
    type MeasuredRun = TextRun & { width: number; };
    const lines: MeasuredRun[][] = [[]];
    let lineWidth = 0;

    for (const run of runs) {
        for (const token of run.text.split(/(\n|\s+)/)) {
            if (!token) continue;
            if (token === "\n") {
                lines.push([]);
                lineWidth = 0;
                continue;
            }

            const isWhitespace = /^\s+$/.test(token);
            if (isWhitespace && lines.at(-1)!.length === 0) continue;

            setRunFont(context, run.style, fontSize, fontFamily);
            const { width } = context.measureText(token);

            if (!isWhitespace && lineWidth + width > maxWidth && lines.at(-1)!.length) {
                lines.push([]);
                lineWidth = 0;
            }

            lines.at(-1)!.push({ ...run, text: token, width });
            lineWidth += width;
        }
    }

    const lineHeight = fontSize * 1.28;
    const firstBaseline = centerY - lines.length * lineHeight / 2 + fontSize;

    lines.forEach((line, lineIndex) => {
        const totalWidth = line.reduce((sum, run) => sum + run.width, 0);
        let x = centerX - totalWidth / 2;
        const baseline = firstBaseline + lineIndex * lineHeight;

        for (const run of line) {
            setRunFont(context, run.style, fontSize, fontFamily);

            if (run.style.code && run.text.trim()) {
                context.fillStyle = "rgb(38, 38, 38)";
                context.fillRect(x - 3, baseline - fontSize * 0.82, run.width + 6, fontSize * 1.05);
            }

            context.fillStyle = "white";
            context.fillText(run.text, x, baseline);

            if (run.style.underline || run.style.strike) {
                context.strokeStyle = "white";
                context.lineWidth = Math.max(1, fontSize / 24);
                context.beginPath();
                const decorationY = run.style.strike ? baseline - fontSize * 0.32 : baseline + 3;
                context.moveTo(x, decorationY);
                context.lineTo(x + run.width, decorationY);
                context.stroke();
            }

            x += run.width;
        }
    });

    return firstBaseline + (lines.length - 1) * lineHeight;
}

function drawCenteredText(
    context: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    baseline: number,
    font: string,
    color: string
) {
    context.font = font;
    context.fillStyle = color;
    context.fillText(text, centerX - context.measureText(text).width / 2, baseline);
}

function drawAvatarFade(context: CanvasRenderingContext2D, height: number) {
    const fadeCanvas = document.createElement("canvas");
    const fadeWidth = 800;
    fadeCanvas.width = fadeWidth;
    fadeCanvas.height = height;

    const fadeContext = fadeCanvas.getContext("2d");
    if (!fadeContext) throw new Error("Canvas rendering is unavailable.");

    const imageData = fadeContext.createImageData(fadeWidth, height);
    const { data } = imageData;
    const featherWidth = 370;
    const straightBlackX = 520;
    const curveEndY = height * 0.3;
    const curveRadius = 95;

    for (let y = 0; y < height; y++) {
        const distanceFromCurveEnd = Math.max(0, curveEndY - y);
        const solidBlackX = distanceFromCurveEnd >= curveRadius
            ? straightBlackX - curveRadius
            : straightBlackX - curveRadius + Math.sqrt(curveRadius ** 2 - distanceFromCurveEnd ** 2);
        const transparentX = solidBlackX - featherWidth;

        for (let x = 0; x < fadeWidth; x++) {
            const progress = Math.max(0, Math.min(1, (x - transparentX) / featherWidth));
            const alpha = progress * progress * (3 - 2 * progress);
            const offset = (y * fadeWidth + x) * 4;
            data[offset + 3] = Math.round(alpha * 255);
        }
    }

    fadeContext.putImageData(imageData, 0, 0);
    context.drawImage(fadeCanvas, 0, 0);
}

async function generateQuoteImage(
    imageUrl: string,
    markdown: string,
    displayName: string,
    username: string,
    width = 1250,
    height = 625
) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch the avatar (${response.status}).`);

    const objectUrl = URL.createObjectURL(await response.blob());

    try {
        const [image] = await Promise.all([loadImage(objectUrl), document.fonts.ready]);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");

        const fontFamily = getComputedStyle(document.body).fontFamily || '"gg sans", "Noto Sans", sans-serif';

        context.fillStyle = "black";
        context.fillRect(0, 0, width, height);

        const imageWidth = 700;
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - sourceSize) / 2;
        const sourceY = (image.naturalHeight - sourceSize) / 2;

        context.save();
        context.filter = "grayscale(1) brightness(1.25) contrast(1.05)";
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, imageWidth, height);
        context.restore();

        drawAvatarFade(context, height);

        const quoteCenterX = 895;
        const quoteWidth = 570;
        const fontSize = calculateFontSize(markdown.length, quoteWidth, 330);
        const quoteBaseline = drawStyledTextCentered(
            context,
            parseStyledText(markdown),
            quoteCenterX,
            height / 2 - 48,
            quoteWidth,
            fontSize,
            fontFamily
        );

        drawCenteredText(
            context,
            `- ${displayName}`,
            quoteCenterX,
            quoteBaseline + 52,
            `italic 28px ${fontFamily}`,
            "white"
        );
        drawCenteredText(
            context,
            `@${username}`,
            quoteCenterX,
            quoteBaseline + 84,
            `400 20px ${fontFamily}`,
            "rgb(145, 145, 145)"
        );

        return await canvasToBlob(canvas);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function getDisplayName(message: Message, guildId?: string) {
    return (guildId && GuildMemberStore.getMember(guildId, message.author.id)?.nick)
        || message.author.globalName
        || message.author.username;
}

async function uploadQuote(message: Message, guildId: string | undefined, renderedText: string) {
    const channelId = message.channel_id;
    const avatarUrl = message.author.getAvatarURL(guildId, 4096, false);
    const quoteBlob = await generateQuoteImage(
        avatarUrl,
        renderedText,
        getDisplayName(message, guildId),
        message.author.username
    );
    const file = new File([quoteBlob], "quote.png", { type: "image/png" });
    const reply = PendingReplyStore.getPendingReply(channelId);
    const replyOptions = MessageActions.getSendMessageOptionsForReply(reply);

    const upload = new CloudUpload({
        file,
        isThumbnail: false,
        platform: CloudUploadPlatform.WEB
    }, channelId);

    await sendMessage(channelId, { content: "" }, false, {
        ...replyOptions,
        attachmentsToUpload: [upload]
    });

    if (replyOptions?.messageReference)
        FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
}

async function quoteAndSend(message: Message, guildId?: string) {
    const renderedText = resolveDiscordMarkdown(message.content, guildId);
    if (!renderedText) {
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
        await uploadQuote(message, guildId, renderedText);
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
    description: "Right-click a message to quote your friends' wild statements.",
    tags: ["Chat", "Fun"],
    authors: [{
        name: "NuzFlameV2",
        id: 1248366351194652712n
    }],
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
