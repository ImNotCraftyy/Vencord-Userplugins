/*
 * mathCounter - Vencord User Plugin
 * Created by NuzFlameV2
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    ChatBarButton,
    ChatBarButtonFactory
} from "@api/ChatButtons";
import {
    ApplicationCommandInputType,
    sendBotMessage
} from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { sendMessage } from "@utils/discord";
import definePlugin, {
    IconComponent,
    OptionType
} from "@utils/types";
import {
    MessageStore,
    UserStore
} from "@webpack/common";

type SignedTerm = {
    sign: 1 | -1;
    text: string;
};

const settings = definePluginSettings({
    increment: {
        type: OptionType.NUMBER,
        displayName: "Count increment",
        description:
            "Amount added to the latest valid count.",
        default: 1,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= -1_000_000 &&
            value <= 1_000_000 ||
            "Enter a whole number from -1,000,000 to 1,000,000."
    },

    standardMaxLength: {
        type: OptionType.NUMBER,
        displayName: "Maximum length without Nitro",
        description:
            "Maximum generated expression length for accounts without Nitro.",
        default: 1900,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 100 &&
            value <= 2000 ||
            "Enter a whole number from 100 to 2,000."
    },

    nitroMaxLength: {
        type: OptionType.NUMBER,
        displayName: "Maximum length with Nitro",
        description:
            "Maximum generated expression length when Nitro is detected.",
        default: 4000,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 100 &&
            value <= 4000 ||
            "Enter a whole number from 100 to 4,000."
    },

    historySearchLimit: {
        type: OptionType.NUMBER,
        displayName: "History search limit",
        description:
            "Maximum number of loaded messages searched backward for a valid count.",
        default: 500,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 1 &&
            value <= 10_000 ||
            "Enter a whole number from 1 to 10,000."
    },

    maximumEquationInputLength: {
        type: OptionType.NUMBER,
        displayName: "Maximum equation input length",
        description:
            "Longest previous equation the plugin will attempt to solve.",
        default: 10_000,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 1 &&
            value <= 100_000 ||
            "Enter a whole number from 1 to 100,000."
    },

    multiplicationMaximum: {
        type: OptionType.NUMBER,
        displayName: "Multiplication number maximum",
        description:
            "Largest random number used in multiplication terms.",
        default: 20,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 1 &&
            value <= 10_000 ||
            "Enter a whole number from 1 to 10,000."
    },

    divisionDivisorMaximum: {
        type: OptionType.NUMBER,
        displayName: "Division divisor maximum",
        description:
            "Largest random divisor used in division terms.",
        default: 12,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 1 &&
            value <= 10_000 ||
            "Enter a whole number from 1 to 10,000."
    },

    divisionQuotientMaximum: {
        type: OptionType.NUMBER,
        displayName: "Division quotient maximum",
        description:
            "Largest random quotient used in division terms.",
        default: 15,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 1 &&
            value <= 10_000 ||
            "Enter a whole number from 1 to 10,000."
    },

    plainNumberMaximum: {
        type: OptionType.NUMBER,
        displayName: "Plain number maximum",
        description:
            "Largest random plain number used in cancellation terms.",
        default: 100,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 1 &&
            value <= 1_000_000 ||
            "Enter a whole number from 1 to 1,000,000."
    },

    targetSplitRange: {
        type: OptionType.NUMBER,
        displayName: "Target split range",
        description:
            "Maximum random offset used when hiding the target among terms.",
        default: 250,
        isValid: value =>
            Number.isSafeInteger(value) &&
            value >= 1 &&
            value <= 1_000_000 ||
            "Enter a whole number from 1 to 1,000,000."
    },

    stopWhenLatestCountIsYours: {
        type: OptionType.BOOLEAN,
        displayName: "Stop when latest count is yours",
        description:
            "Do not send when the most recent valid counting message was sent by you.",
        default: true
    },

    showSuccessMessage: {
        type: OptionType.BOOLEAN,
        displayName: "Show success notice",
        description:
            "Show a private confirmation after sending a count.",
        default: false
    }
});

function randomInt(minimum: number, maximum: number) {
    return Math.floor(
        Math.random() * (maximum - minimum + 1)
    ) + minimum;
}

function choose<T>(items: T[]): T {
    return items[randomInt(0, items.length - 1)];
}

function shuffle<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index--) {
        const swapIndex = randomInt(0, index);

        [items[index], items[swapIndex]] =
            [items[swapIndex], items[index]];
    }

    return items;
}

function createMultiplication() {
    const maximum =
        settings.store.multiplicationMaximum;

    const left = randomInt(1, maximum);
    const right = randomInt(1, maximum);

    return `(${left}*${right})`;
}

function createDivision() {
    const divisor = randomInt(
        1,
        settings.store.divisionDivisorMaximum
    );

    const quotient = randomInt(
        1,
        settings.store.divisionQuotientMaximum
    );

    return `(${divisor * quotient}/${divisor})`;
}

function createPower() {
    const exponent = choose([2, 2, 2, 3, 3, 4]);

    const maximumBase =
        exponent === 4 ? 4 :
        exponent === 3 ? 5 :
        12;

    return `(${randomInt(2, maximumBase)}^${exponent})`;
}

function createPlainNumber() {
    return String(
        randomInt(
            1,
            settings.store.plainNumberMaximum
        )
    );
}

function createOperation() {
    switch (choose([
        "multiply",
        "multiply",
        "divide",
        "power",
        "power",
        "number"
    ])) {
        case "multiply":
            return createMultiplication();

        case "divide":
            return createDivision();

        case "power":
            return createPower();

        default:
            return createPlainNumber();
    }
}

function createTargetTerms(target: number): SignedTerm[] {
    const range = settings.store.targetSplitRange;

    const method = choose([
        "addition",
        "subtraction",
        "threeTerms",
        "division"
    ]);

    if (method === "addition") {
        const first = randomInt(-range, range);
        const second = target - first;

        return [
            { sign: 1, text: String(first) },
            { sign: 1, text: String(second) }
        ];
    }

    if (method === "subtraction") {
        const subtracted = randomInt(1, range);

        return [
            {
                sign: 1,
                text: String(target + subtracted)
            },
            {
                sign: -1,
                text: String(subtracted)
            }
        ];
    }

    if (method === "threeTerms") {
        const first = randomInt(-range, range);
        const second = randomInt(-range, range);
        const third = target - first - second;

        return [
            { sign: 1, text: String(first) },
            { sign: 1, text: String(second) },
            { sign: 1, text: String(third) }
        ];
    }

    const divisor = randomInt(
        2,
        Math.max(
            2,
            settings.store.divisionDivisorMaximum
        )
    );

    const offset = randomInt(-range, range);
    const numerator = (target - offset) * divisor;

    return [
        {
            sign: 1,
            text: `(${numerator}/${divisor})`
        },
        {
            sign: 1,
            text: String(offset)
        }
    ];
}

function createCancelingTerms(): SignedTerm[] {
    const operation = createOperation();

    return [
        { sign: 1, text: operation },
        { sign: -1, text: operation }
    ];
}

function estimateLength(terms: SignedTerm[]) {
    return terms.reduce((total, term, index) => {
        const signLength =
            index === 0 && term.sign === 1 ? 0 : 1;

        return total + signLength + term.text.length;
    }, 0);
}

function termsToExpression(terms: SignedTerm[]) {
    return terms.map((term, index) => {
        if (index === 0) {
            return term.sign === -1
                ? `-${term.text}`
                : term.text;
        }

        return `${term.sign === -1 ? "-" : "+"}${term.text}`;
    }).join("");
}

function buildExpression(
    target: number,
    maximumLength: number
) {
    const terms = createTargetTerms(target);

    while (true) {
        const pair = createCancelingTerms();
        const candidate = [...terms, ...pair];

        if (estimateLength(candidate) > maximumLength) {
            break;
        }

        terms.push(...pair);
    }

    shuffle(terms);

    const expression = termsToExpression(terms);
    const result = evaluateExpression(expression);

    if (result !== target) {
        throw new Error(
            "Generated expression did not verify."
        );
    }

    return expression;
}

function evaluateExpression(content: string): number | null {
    const trimmed = content.trim();

    if (
        trimmed.length === 0 ||
        trimmed.length >
            settings.store.maximumEquationInputLength ||
        !/^[0-9+\-*/().^\s]+$/.test(trimmed)
    ) {
        return null;
    }

    try {
        const javascriptExpression =
            trimmed.replaceAll("^", "**");

        const value = Function(
            `"use strict"; return (${javascriptExpression});`
        )();

        if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            !Number.isSafeInteger(value)
        ) {
            return null;
        }

        return value;
    } catch {
        return null;
    }
}

function getMostRecentCount(channelId: string) {
    const messages =
        MessageStore.getMessages(channelId)._array;

    const minimumIndex = Math.max(
        0,
        messages.length -
            settings.store.historySearchLimit
    );

    for (
        let index = messages.length - 1;
        index >= minimumIndex;
        index--
    ) {
        const message = messages[index];

        if (message.deleted) {
            continue;
        }

        const value =
            evaluateExpression(message.content);

        if (value === null) {
            continue;
        }

        return {
            message,
            value
        };
    }

    return null;
}

function hasNitro() {
    const currentUser =
        UserStore.getCurrentUser() as {
            premiumType?: number;
        };

    return (currentUser.premiumType ?? 0) > 0;
}

async function runCount(channelId: string) {
    const latestCount =
        getMostRecentCount(channelId);

    if (!latestCount) {
        sendBotMessage(channelId, {
            content:
                "No valid counting message was found in the currently loaded channel history."
        });

        return;
    }

    const currentUser =
        UserStore.getCurrentUser();

    if (
        settings.store.stopWhenLatestCountIsYours &&
        latestCount.message.author.id ===
            currentUser.id
    ) {
        sendBotMessage(channelId, {
            content:
                "The latest valid counting message was sent by you, so nothing was sent."
        });

        return;
    }

    const nextValue =
        latestCount.value +
        settings.store.increment;

    if (!Number.isSafeInteger(nextValue)) {
        sendBotMessage(channelId, {
            content:
                "The next value would exceed JavaScript's safe integer range."
        });

        return;
    }

    const maximumLength =
        hasNitro()
            ? settings.store.nitroMaxLength
            : settings.store.standardMaxLength;

    const expression =
        buildExpression(
            nextValue,
            maximumLength
        );

    await sendMessage(
        channelId,
        { content: expression }
    );

    if (settings.store.showSuccessMessage) {
        sendBotMessage(channelId, {
            content:
                `Sent count ${nextValue} using ` +
                `${expression.length} characters.`
        });
    }
}

const CountIcon: IconComponent = ({
    height = 24,
    width = 24,
    className
}) => (
    <svg
        width={width}
        height={height}
        className={className}
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <rect
            x="4"
            y="3"
            width="16"
            height="18"
            rx="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
        />
        <path
            d="M8 7.5h8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
        />
        <path
            d="M8 12h2M14 12h2M8 16h2M14 16h2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        />
        <path
            d="M18.6 2.7 19 4l1.3.4L19 4.8l-.4 1.3-.4-1.3-1.3-.4 1.3-.4.4-1.3Z"
            fill="currentColor"
        />
    </svg>
);

const CountChatBarButton: ChatBarButtonFactory = ({
    channel,
    disabled,
    isMainChat
}) => {
    if (!isMainChat || disabled) {
        return null;
    }

    return (
        <ChatBarButton
            tooltip="Send next count"
            onClick={() =>
                void runCount(channel.id)
            }
            buttonProps={{
                "aria-label":
                    "Send next count"
            }}
        >
            <CountIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "Math Counter",
    description:
        "Adds /count and a chat-bar button for sending the next randomized math count.",
    authors: [
        {
            name: "NuzFlameV2",
            id: 1248366351194652712n
        }
    ],
    tags: [
        "Chat",
        "Commands",
        "Utility"
    ],

    settings,

    commands: [
        {
            name: "count",
            description:
                "Find the latest valid count and send the next math expression",
            inputType:
                ApplicationCommandInputType.BUILT_IN,

            async execute(_args, { channel }) {
                await runCount(channel.id);
            }
        }
    ],

    chatBarButton: {
        icon: CountIcon,
        render: CountChatBarButton
    }
});
