/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Constants, DraftStore, DraftType, RestAPI, showToast, Toasts, useState, useStateFromStores } from "@webpack/common";

const logger = new Logger("FakeForward");

const DraftManager = findByPropsLazy("clearDraft", "saveDraft");

const busyChannels = new Set<string>();

const settings = definePluginSettings({
    sourceUserId: {
        type: OptionType.STRING,
        displayName: "DM User ID",
        description: "The user whose DM is used as the temporary forwarding source.",
        default: "1513317540519219261",
        placeholder: "1513317540519219261",
        isValid: (value: string) => /^\d{17,20}$/.test(value.trim()) || "Enter a valid Discord user ID."
    }
});

const ForwardIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg
        aria-hidden="true"
        className={className}
        fill="none"
        height={height}
        viewBox="0 0 24 24"
        width={width}
    >
        <path
            d="M13 5 20 12 13 19M20 12H8a4 4 0 0 0-4 4v3"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
        />
    </svg>
);

async function deleteSource(channelId: string, messageId: string) {
    await RestAPI.del({
        url: Constants.Endpoints.MESSAGE(channelId, messageId)
    });
}

async function openSourceDm() {
    const response = await RestAPI.post({
        url: "/users/@me/channels",
        body: { recipient_id: settings.store.sourceUserId.trim() }
    });

    return response.body.id as string;
}

async function sendAsForward(destinationChannelId: string, content: string) {
    let sourceChannelId: string | undefined;
    let sourceId: string | undefined;

    try {
        sourceChannelId = await openSourceDm();

        const source = await RestAPI.post({
            url: Constants.Endpoints.MESSAGES(sourceChannelId),
            body: { content }
        });

        const createdSourceId = sourceId = source.body.id;

        await RestAPI.post({
            url: Constants.Endpoints.MESSAGES(destinationChannelId),
            body: {
                message_reference: {
                    type: 1,
                    message_id: createdSourceId,
                    channel_id: sourceChannelId
                }
            }
        });

        DraftManager.clearDraft(destinationChannelId, DraftType.ChannelMessage);

        try {
            await deleteSource(sourceChannelId, createdSourceId);
        } catch (error) {
            logger.error("Forward sent, but the temporary source could not be deleted", error);
            showToast("Forward sent, but the temporary source message could not be deleted.", Toasts.Type.FAILURE);
        }
    } catch (error) {
        logger.error("Failed to create forward", error);

        if (sourceChannelId && sourceId) {
            try {
                await deleteSource(sourceChannelId, sourceId);
            } catch (deleteError) {
                logger.error("Failed to clean up the temporary source", deleteError);
            }
        }

        showToast("Could not create the forward. Your draft was kept.", Toasts.Type.FAILURE);
    }
}

const FakeForwardButton: ChatBarButtonFactory = ({ channel: { id: channelId }, isAnyChat }) => {
    const draft = useStateFromStores([DraftStore], () => DraftStore.getDraft(channelId, DraftType.ChannelMessage));
    const [busy, setBusy] = useState(() => busyChannels.has(channelId));

    if (!isAnyChat) return null;

    return (
        <ChatBarButton
            tooltip={busy ? "Creating forward…" : "FakeForward"}
            onClick={async () => {
                if (busyChannels.has(channelId)) return;

                if (!draft.length) {
                    showToast("Type something first.", Toasts.Type.MESSAGE);
                    return;
                }

                busyChannels.add(channelId);
                setBusy(true);

                try {
                    await sendAsForward(channelId, draft);
                } finally {
                    busyChannels.delete(channelId);
                    setBusy(false);
                }
            }}
            buttonProps={{
                "aria-disabled": busy,
                style: { opacity: busy ? 0.5 : 1 }
            }}
        >
            <ForwardIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "Fake Forward",
    description: "Send your chatbox text as a real forwarded message.",
    authors: [
        { name: "NuzFlameV2", id: 1248366351194652712n },
        { name: "ItsDenji777", id: 876433011866992680n }
    ],
    settings,

    chatBarButton: {
        icon: ForwardIcon,
        render: FakeForwardButton
    }
});
