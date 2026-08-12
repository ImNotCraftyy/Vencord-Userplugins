/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButtonMap } from "@api/ChatButtons";
import {
    definePluginSettings,
    useSettings
} from "@api/Settings";
import { FormSwitch } from "@components/FormSwitch";
import definePlugin, { OptionType } from "@utils/types";
import {
    Button,
    Forms,
    React,
    Text,
    useEffect,
    useState
} from "@webpack/common";

type BuiltInId =
    | "gift"
    | "apps"
    | "gif"
    | "stickers"
    | "emoji"
    | "upload"
    | "voice"
    | "poll";

const STYLE_ID = "vc-hide-chat-icons-style";
const MANAGED_ATTRIBUTE =
    "data-vc-hide-chat-icons-managed";

const STYLE = `
[${MANAGED_ATTRIBUTE}="hidden"] {
    display: none !important;
}

/* Add comfortable spacing without changing click targets. */
[class*="channelTextArea"] [class*="buttons"] {
    column-gap: 6px !important;
}

.vc-chatbar-button {
    margin: 0 !important;
}
`;

let observer: MutationObserver | null = null;
let scanTimer: number | null = null;
let registryTimer: number | null = null;
let lastPluginSignature = "";

function scheduleApply() {
    if (scanTimer !== null)
        window.clearTimeout(scanTimer);

    scanTimer = window.setTimeout(() => {
        scanTimer = null;
        applyBuiltInVisibility();
    }, 20);
}

const settings = definePluginSettings({
    hideGift: {
        type: OptionType.BOOLEAN,
        description: "Hide the Gift / Nitro gift button.",
        default: true,
        onChange: scheduleApply
    },

    hideApps: {
        type: OptionType.BOOLEAN,
        description: "Hide the Apps / Activities button.",
        default: true,
        onChange: scheduleApply
    },

    hideGif: {
        type: OptionType.BOOLEAN,
        description: "Hide the GIF picker button.",
        default: false,
        onChange: scheduleApply
    },

    hideStickers: {
        type: OptionType.BOOLEAN,
        description: "Hide the sticker picker button.",
        default: false,
        onChange: scheduleApply
    },

    hideEmoji: {
        type: OptionType.BOOLEAN,
        description: "Hide the emoji picker button.",
        default: false,
        onChange: scheduleApply
    },

    hideUpload: {
        type: OptionType.BOOLEAN,
        description:
            "Hide Upload / More message options.",
        default: false,
        onChange: scheduleApply
    },

    hideVoiceMessage: {
        type: OptionType.BOOLEAN,
        description: "Hide the voice-message button.",
        default: false,
        onChange: scheduleApply
    },

    hidePoll: {
        type: OptionType.BOOLEAN,
        description: "Hide the poll button.",
        default: false,
        onChange: scheduleApply
    },

    pluginButtons: {
        type: OptionType.COMPONENT,
        component: PluginButtonSettings
    }
});

function normalize(value: string | null | undefined) {
    return (value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function classifyLabel(label: string): BuiltInId | null {
    const text = normalize(label);

    if (
        text.includes("send a gift") ||
        text.includes("give a gift") ||
        text.includes("nitro gift") ||
        text === "gift"
    ) return "gift";

    if (
        text === "apps" ||
        text.includes("open apps") ||
        text.includes("application launcher") ||
        text.includes("activities") ||
        text.includes("launch activity")
    ) return "apps";

    if (
        text === "gif" ||
        text.includes("gif picker") ||
        text.includes("open gif") ||
        text.includes("select a gif")
    ) return "gif";

    if (
        text === "sticker" ||
        text === "stickers" ||
        text.includes("sticker picker") ||
        text.includes("open sticker") ||
        text.includes("select a sticker")
    ) return "stickers";

    if (
        text === "emoji" ||
        text === "emojis" ||
        text === "add emoji" ||
        text.includes("emoji picker") ||
        text.includes("open emoji") ||
        text.includes("select emoji")
    ) return "emoji";

    if (
        text === "more message options" ||
        text.includes("upload a file") ||
        text.includes("upload file") ||
        text.includes("add attachment") ||
        text.includes("attach file")
    ) return "upload";

    if (
        text.includes("voice message") ||
        text.includes("record voice")
    ) return "voice";

    if (
        text === "poll" ||
        text.includes("create poll")
    ) return "poll";

    return null;
}

function shouldHide(id: BuiltInId) {
    switch (id) {
        case "gift":
            return settings.store.hideGift;
        case "apps":
            return settings.store.hideApps;
        case "gif":
            return settings.store.hideGif;
        case "stickers":
            return settings.store.hideStickers;
        case "emoji":
            return settings.store.hideEmoji;
        case "upload":
            return settings.store.hideUpload;
        case "voice":
            return settings.store.hideVoiceMessage;
        case "poll":
            return settings.store.hidePoll;
    }
}

function getButtonLabel(button: HTMLElement) {
    const values: Array<string | null | undefined> = [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.getAttribute("data-name"),
        button.getAttribute("data-testid"),
        button.querySelector("svg")
            ?.getAttribute("aria-label"),
        button.querySelector("svg title")
            ?.textContent
    ];

    const labelledBy =
        button.getAttribute("aria-labelledby");

    if (labelledBy) {
        for (const id of labelledBy.split(/\s+/)) {
            values.push(
                document.getElementById(id)
                    ?.textContent
            );
        }
    }

    return values
        .filter(
            (value): value is string =>
                typeof value === "string" &&
                value.trim().length > 0
        )
        .join(" ");
}

function getComposerEntries() {
    const entries: Array<{
        root: HTMLElement;
        editor: HTMLElement;
    }> = [];

    const editors =
        document.querySelectorAll<HTMLElement>(
            [
                '[contenteditable="true"][role="textbox"]',
                'textarea[class*="textArea"]'
            ].join(",")
        );

    for (const editor of editors) {
        const root =
            editor.closest<HTMLElement>(
                '[class*="channelTextArea"]'
            ) ??
            editor.closest<HTMLElement>("form");

        if (!root)
            continue;

        /*
         * Settings and search fields can also be text boxes.
         * A message composer contains several nearby icon buttons.
         */
        if (
            root.querySelectorAll(
                'button, [role="button"]'
            ).length < 2
        ) {
            continue;
        }

        entries.push({ root, editor });
    }

    return entries;
}

function findLayoutWrapper(
    button: HTMLElement,
    root: HTMLElement,
    editor: HTMLElement
) {
    const known = button.closest<HTMLElement>(
        [
            ".expression-picker-chat-input-button",
            '[class*="buttonContainer"]'
        ].join(",")
    );

    if (
        known &&
        root.contains(known) &&
        !known.classList.contains(
            "vc-chatbar-button"
        )
    ) {
        return known;
    }

    let current: HTMLElement = button;

    while (
        current.parentElement &&
        current.parentElement !== root
    ) {
        const parent = current.parentElement;

        /*
         * The button row contains multiple controls but
         * does not contain the message editor itself.
         */
        if (
            !parent.contains(editor) &&
            parent.querySelectorAll(
                'button, [role="button"]'
            ).length >= 2
        ) {
            return current;
        }

        current = parent;
    }

    return button;
}

function restoreManagedElements() {
    document
        .querySelectorAll<HTMLElement>(
            `[${MANAGED_ATTRIBUTE}]`
        )
        .forEach(element =>
            element.removeAttribute(
                MANAGED_ATTRIBUTE
            )
        );
}

function applyBuiltInVisibility() {
    restoreManagedElements();

    for (
        const { root, editor }
        of getComposerEntries()
    ) {
        const seen = new Set<HTMLElement>();

        const candidates =
            root.querySelectorAll<HTMLElement>(
                [
                    "button",
                    '[role="button"]',
                    "[aria-label]",
                    "[title]"
                ].join(",")
            );

        for (const candidate of candidates) {
            const button =
                candidate.closest<HTMLElement>(
                    'button, [role="button"]'
                );

            if (!button || seen.has(button))
                continue;

            seen.add(button);

            /*
             * Vencord/plugin buttons are controlled by
             * Vencord's native settings below.
             */
            if (
                button.closest(
                    ".vc-chatbar-button"
                )
            ) {
                continue;
            }

            const kind = classifyLabel(
                getButtonLabel(button)
            );

            if (!kind || !shouldHide(kind))
                continue;

            findLayoutWrapper(
                button,
                root,
                editor
            ).setAttribute(
                MANAGED_ATTRIBUTE,
                "hidden"
            );
        }
    }
}

function PluginButtonSettings() {
    const { chatBarButtons } = useSettings([
        "uiElements.chatBarButtons.*"
    ]).uiElements;

    const [, forceUpdate] = useState(0);

    const refresh = () =>
        forceUpdate(value => value + 1);

    useEffect(() => {
        const timer = window.setInterval(
            refresh,
            750
        );

        return () =>
            window.clearInterval(timer);
    }, []);

    const ids = [...ChatBarButtonMap.keys()]
        .sort((left, right) =>
            left.localeCompare(right)
        );

    return (
        <section style={{ marginTop: 20 }}>
            <Forms.FormTitle tag="h3">
                Plugin buttons
            </Forms.FormTitle>

            <Forms.FormText>
                Controlled by Vencord's native reactive
                chat-button settings.
            </Forms.FormText>

            {ids.length === 0 ? (
                <Text
                    variant="text-sm/normal"
                    style={{ marginTop: 12 }}
                >
                    No plugin buttons are registered.
                </Text>
            ) : (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0,
                        marginTop: 12
                    }}
                >
                    {ids.map(id => {
                        const enabled =
                            chatBarButtons[id]
                                ?.enabled !== false;

                        return (
                            <FormSwitch
                                key={id}
                                title={id}
                                note="Vencord plugin"
                                value={enabled}
                                onChange={nextEnabled => {
                                    chatBarButtons[id] ??= {
                                        enabled: true
                                    };

                                    chatBarButtons[id]
                                        .enabled =
                                        nextEnabled;

                                    refresh();
                                }}
                            />
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function checkPluginRegistry() {
    const signature =
        [...ChatBarButtonMap.keys()].join("\n");

    if (signature === lastPluginSignature)
        return;

    lastPluginSignature = signature;
}

export default definePlugin({
    name: "Hide Chat Icons",
    description:
        "Select individual icons to remove from view in the text field.",
    authors: [{name: "NuzFlameV2", id: 1248366351194652712n},{ name: "ItsDenji777", id: 876433011866992680n}],
    tags: ["Chat", "Customization"],

    settings,

    start() {
        const style =
            document.createElement("style");

        style.id = STYLE_ID;
        style.textContent = STYLE;
        document.head.appendChild(style);

        observer = new MutationObserver(
            scheduleApply
        );

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "aria-label",
                "aria-labelledby",
                "title"
            ]
        });

        registryTimer = window.setInterval(
            checkPluginRegistry,
            750
        );

        applyBuiltInVisibility();
    },

    stop() {
        observer?.disconnect();
        observer = null;

        if (scanTimer !== null)
            window.clearTimeout(scanTimer);

        if (registryTimer !== null)
            window.clearInterval(registryTimer);

        scanTimer = null;
        registryTimer = null;
        lastPluginSignature = "";

        restoreManagedElements();

        document
            .getElementById(STYLE_ID)
            ?.remove();
    }
});
