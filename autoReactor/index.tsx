/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, FluxDispatcher, React, RestAPI, UserStore } from "@webpack/common";

type ChannelKind = "server" | "dm" | "groupDm";

interface UserRule {
    id: string;
    userId: string;
    reaction: string;
}

interface DiscordMessage {
    id: string;
    channel_id: string;
    author: { id: string; };
    reactions?: Array<{
        me?: boolean;
        me_burst?: boolean;
        emoji?: { id?: string | null; name?: string | null; };
    }>;
}

interface MessageCreateEvent {
    message?: DiscordMessage;
    optimistic?: boolean;
}

const BASE_DELAY_MS = 100;
const RANDOM_DELAY_MS = 80;
const CHANNEL_COOLDOWN_MS = 225;

function createRule(): UserRule {
    return {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: "",
        reaction: "👍"
    };
}

const inputStyle: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "10px 13px",
    borderRadius: 12,
    border: "1px solid var(--input-border, var(--background-modifier-accent))",
    outline: "none",
    background: "var(--input-background, var(--background-tertiary))",
    color: "var(--text-normal)",
    fontSize: 14
};

const primaryButtonStyle: React.CSSProperties = {
    minHeight: 36,
    padding: "8px 15px",
    border: "1px solid color-mix(in srgb, var(--brand-500) 80%, white 20%)",
    borderRadius: 10,
    cursor: "pointer",
    background: "var(--brand-500)",
    color: "white",
    fontWeight: 600,
    boxShadow: "0 2px 8px rgb(0 0 0 / 18%)"
};

const removeButtonStyle: React.CSSProperties = {
    minHeight: 38,
    padding: "8px 13px",
    border: "1px solid color-mix(in srgb, var(--status-danger) 80%, white 20%)",
    borderRadius: 10,
    cursor: "pointer",
    background: "var(--status-danger)",
    color: "white",
    fontWeight: 600
};

function UserRulesEditor() {
    const storedRules = settings.use(["userRules"]).userRules as UserRule[];
    const [rules, setRules] = React.useState<UserRule[]>(() => Array.isArray(storedRules) ? storedRules : []);

    const save = (next: UserRule[]) => {
        setRules(next);
        settings.store.userRules = next;
    };

    const addUser = () => save([...rules, createRule()]);

    const update = (id: string, patch: Partial<UserRule>) => {
        save(rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule));
    };

    const remove = (id: string) => save(rules.filter(rule => rule.id !== id));

    return (
        <section style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                    <div style={{ fontWeight: 600, color: "var(--header-primary)" }}>Selected Users</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Add only the people you want Auto Reactor to follow.</div>
                </div>
                <button type="button" onClick={addUser} style={primaryButtonStyle}>Add User</button>
            </div>

            {rules.length === 0 && (
                <div style={{ padding: 13, border: "1px solid var(--background-modifier-accent)", borderRadius: 12, background: "var(--background-secondary)", color: "var(--text-muted)" }}>
                    No selected users yet.
                </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {rules.map((rule, index) => (
                    <div
                        key={rule.id}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(190px, 1fr) minmax(150px, 0.7fr) auto",
                            gap: 9,
                            alignItems: "center",
                            padding: 11,
                            border: "1px solid var(--background-modifier-accent)",
                            borderRadius: 13,
                            background: "var(--background-secondary)"
                        }}
                    >
                        <input
                            style={inputStyle}
                            value={rule.userId}
                            placeholder={`User ${index + 1} ID`}
                            onChange={event => update(rule.id, { userId: event.currentTarget.value.replace(/\D/g, "") })}
                        />
                        <input
                            style={inputStyle}
                            value={rule.reaction}
                            placeholder="👍 or emoji_name:ID"
                            onChange={event => update(rule.id, { reaction: event.currentTarget.value })}
                        />
                        <button type="button" onClick={() => remove(rule.id)} style={removeButtonStyle}>Remove</button>
                    </div>
                ))}
            </div>
        </section>
    );
}

function hasNitro(): boolean {
    const user = UserStore.getCurrentUser() as any;
    return Boolean(user && Number(user.premiumType ?? user.premium_type ?? 0) > 0);
}

function SuperReactionSetting() {
    const stored = Boolean(settings.use(["superReactions"]).superReactions);
    const nitro = hasNitro();

    React.useEffect(() => {
        if (!nitro && stored) settings.store.superReactions = false;
    }, [nitro, stored]);

    const enabled = nitro && stored;

    const toggle = () => {
        settings.store.superReactions = nitro ? !enabled : false;
    };

    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 16 }}>
            <div>
                <div style={{ color: "var(--header-primary)", fontWeight: 600 }}>Super Reactions</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {nitro ? "Use Super Reactions automatically." : "Requires Nitro. This option is automatically kept off."}
                </div>
            </div>
            <button
                type="button"
                onClick={toggle}
                aria-pressed={enabled}
                style={{
                    position: "relative",
                    width: 42,
                    height: 24,
                    flex: "0 0 auto",
                    padding: 0,
                    border: 0,
                    borderRadius: 999,
                    cursor: nitro ? "pointer" : "not-allowed",
                    opacity: nitro ? 1 : 0.55,
                    background: enabled ? "var(--brand-500)" : "var(--background-modifier-selected)"
                }}
            >
                <span style={{
                    position: "absolute",
                    top: 3,
                    left: enabled ? 21 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 120ms ease"
                }} />
            </button>
        </div>
    );
}

const settings = definePluginSettings({
    reactToSelf: {
        type: OptionType.BOOLEAN,
        description: "Automatically react to messages sent by your own account.",
        default: true
    },
    selfReaction: {
        type: OptionType.STRING,
        description: "Reaction used for your own messages.",
        default: "👍"
    },
    superReactions: {
        type: OptionType.CUSTOM,
        default: false
    },
    superReactionSetting: {
        type: OptionType.COMPONENT,
        component: SuperReactionSetting
    },
    reactInServers: {
        type: OptionType.BOOLEAN,
        description: "React in server channels and threads.",
        default: true
    },
    reactInDms: {
        type: OptionType.BOOLEAN,
        description: "React in direct messages.",
        default: true
    },
    reactInGroupDms: {
        type: OptionType.BOOLEAN,
        description: "React in group direct messages.",
        default: true
    },
    skipIfAlreadyReacted: {
        type: OptionType.BOOLEAN,
        description: "Do not add the same reaction twice.",
        default: true
    },
    userRules: {
        type: OptionType.CUSTOM,
        default: [] as UserRule[]
    },
    userRulesEditor: {
        type: OptionType.COMPONENT,
        component: UserRulesEditor
    }
});

const pendingTimers = new Set<number>();
const channelCooldowns = new Map<string, number>();
let stopped = true;

function normalizeReaction(input: string): string | null {
    const value = input.trim();
    if (!value) return null;

    const markup = value.match(/^<a?:([\w~]+):(\d+)>$/);
    if (markup) return `${markup[1]}:${markup[2]}`;

    const custom = value.match(/^([\w~]+):(\d+)$/);
    if (custom) return `${custom[1]}:${custom[2]}`;

    return value;
}

function getChannelKind(channel: any): ChannelKind | null {
    if (!channel) return null;
    if (channel.guild_id) return "server";
    if (channel.type === 1) return "dm";
    if (channel.type === 3) return "groupDm";
    return null;
}

function kindEnabled(kind: ChannelKind): boolean {
    if (kind === "server") return settings.store.reactInServers;
    if (kind === "dm") return settings.store.reactInDms;
    return settings.store.reactInGroupDms;
}

function alreadyReacted(message: DiscordMessage, reaction: string): boolean {
    if (!settings.store.skipIfAlreadyReacted || !message.reactions) return false;

    return message.reactions.some(existing => {
        if ((!existing.me && !existing.me_burst) || !existing.emoji) return false;
        const current = existing.emoji.id
            ? `${existing.emoji.name ?? "emoji"}:${existing.emoji.id}`
            : existing.emoji.name;
        return current === reaction;
    });
}

async function addReaction(channelId: string, messageId: string, reaction: string): Promise<void> {
    if (settings.store.superReactions && !hasNitro()) settings.store.superReactions = false;

    const encoded = encodeURIComponent(reaction);
    const type = settings.store.superReactions ? "?type=1" : "";
    await RestAPI.put({
        url: `/channels/${channelId}/messages/${messageId}/reactions/${encoded}/@me${type}`
    });
}

function schedule(message: DiscordMessage, reaction: string) {
    const wait = BASE_DELAY_MS + Math.floor(Math.random() * (RANDOM_DELAY_MS + 1));
    const timer = window.setTimeout(async () => {
        pendingTimers.delete(timer);
        if (stopped || alreadyReacted(message, reaction)) return;

        try {
            await addReaction(message.channel_id, message.id, reaction);
        } catch (error) {
            console.error(`[Auto Reactor] Failed to react with ${reaction}:`, error);
        }
    }, wait);

    pendingTimers.add(timer);
}

function onMessageCreate(event: MessageCreateEvent) {
    const message = event.message;
    if (stopped || event.optimistic || !message?.id || !message.channel_id || !message.author?.id) return;

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    const isSelf = message.author.id === currentUserId;
    const rule = isSelf
        ? undefined
        : (settings.store.userRules as UserRule[]).find(rule => rule.userId.trim() === message.author.id);

    if (isSelf ? !settings.store.reactToSelf : !rule) return;

    const channel = ChannelStore.getChannel(message.channel_id);
    const kind = getChannelKind(channel);
    if (!kind || !kindEnabled(kind)) return;

    const now = Date.now();
    const previous = channelCooldowns.get(message.channel_id) ?? 0;
    if (now - previous < CHANNEL_COOLDOWN_MS) return;

    const reaction = normalizeReaction(isSelf ? settings.store.selfReaction : rule!.reaction);
    if (!reaction) return;

    channelCooldowns.set(message.channel_id, now);
    schedule(message, reaction);
}

export default definePlugin({
    name: "Auto Reactor",
    description: "Automatically reacts to messages from yourself or selected users across servers, DMs, and group DMs.",
    authors: [{ name: "NuzFlameV2", id: 1248366351194652712n }],
    settings,

    start() {
        if (!hasNitro()) settings.store.superReactions = false;
        stopped = false;
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
    },

    stop() {
        stopped = true;
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        for (const timer of pendingTimers) window.clearTimeout(timer);
        pendingTimers.clear();
        channelCooldowns.clear();
    }
});
