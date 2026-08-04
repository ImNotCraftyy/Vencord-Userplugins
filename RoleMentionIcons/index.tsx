/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 NuzFlameV2
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Vencord port of Neodymium's BetterDiscord RoleMentionIcons plugin.

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { Role } from "@vencord/discord-types";
import { GuildRoleStore, SelectedGuildStore } from "@webpack/common";

const ICON_CLASS = "vc-roleMentionIcons-icon";
const ROLE_MENTION_SELECTOR = '[class*="roleMention"]';

interface RoleMentionProps {
    guildId?: string;
    roleId?: string;
    roleName?: string;
}

interface ReactFiber {
    memoizedProps?: RoleMentionProps;
    pendingProps?: RoleMentionProps;
    return?: ReactFiber | null;
}

let observer: MutationObserver | undefined;

function removeAllIcons() {
    document.querySelectorAll(`.${ICON_CLASS}`).forEach(icon => icon.remove());
}

function refreshAll() {
    removeAllIcons();
    if (document.body) processRoot(document.body);
}

const settings = definePluginSettings({
    everyone: {
        type: OptionType.BOOLEAN,
        displayName: "@everyone",
        description: "Show an icon on @everyone mentions.",
        default: true,
        onChange: refreshAll
    },
    here: {
        type: OptionType.BOOLEAN,
        displayName: "@here",
        description: "Show an icon on @here mentions.",
        default: true,
        onChange: refreshAll
    },
    showRoleIcons: {
        type: OptionType.BOOLEAN,
        displayName: "Role Icons",
        description: "Show a role's custom icon instead of the default people icon when available.",
        default: true,
        onChange: refreshAll
    }
});

function getMentionProps(element: HTMLElement): RoleMentionProps | undefined {
    const fiberKey = Object.keys(element).find(key => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    let fiber = fiberKey ? (element as any)[fiberKey] as ReactFiber | undefined : undefined;

    for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return ?? undefined) {
        const props = fiber.memoizedProps ?? fiber.pendingProps;
        if (props && (props.roleId || props.roleName)) return props;
    }

    return undefined;
}

function findRole(guildId: string | null | undefined, roleId: string | undefined, roleName: string | undefined): Role | undefined {
    if (!guildId) return undefined;
    if (roleId) return GuildRoleStore.getRole(guildId, roleId);

    const normalizedName = roleName?.replace(/^@/, "");
    if (!normalizedName) return undefined;

    return Object.values(GuildRoleStore.getRolesSnapshot(guildId))
        .find(role => role.name.replace(/^@/, "") === normalizedName);
}

function createDefaultIcon(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", ICON_CLASS);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");

    for (const pathData of [
        "M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.794 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006Z",
        "M20.0001 20.006H22.0001V19.006C22.0001 16.4433 20.2697 14.4415 17.5213 13.5352C19.0621 14.9127 20.0001 16.8059 20.0001 19.006V20.006Z",
        "M14.8834 11.9077C16.6657 11.5044 18.0001 9.9077 18.0001 8.00598C18.0001 5.96916 16.4693 4.28218 14.4971 4.0367C15.4322 5.09511 16.0001 6.48524 16.0001 8.00598C16.0001 9.44888 15.4889 10.7742 14.6378 11.8102C14.7203 11.8418 14.8022 11.8743 14.8834 11.9077Z"
    ]) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        svg.append(path);
    }

    return svg;
}

function createRoleIcon(role: Role): HTMLImageElement {
    const icon = document.createElement("img");
    icon.className = ICON_CLASS;
    icon.alt = "";
    icon.draggable = false;
    icon.src = `${location.protocol}//${window.GLOBAL_ENV.CDN_HOST}/role-icons/${role.id}/${role.icon}.webp?size=24&quality=lossless`;
    return icon;
}

function processMention(element: HTMLElement) {
    if (element.querySelector(`:scope > .${ICON_CLASS}`)) return;

    const props = getMentionProps(element);
    const roleName = props?.roleName ?? element.textContent?.trim();
    const normalizedRoleName = roleName?.replace(/^@/, "");
    const isEveryone = normalizedRoleName === "everyone";
    const isHere = normalizedRoleName === "here";

    if (isEveryone && !settings.store.everyone) return;
    if (isHere && !settings.store.here) return;

    const guildId = props?.guildId ?? SelectedGuildStore.getGuildId();
    const role = findRole(guildId, props?.roleId, roleName);

    // Some user mentions share Discord's role-mention component while their user is uncached.
    if (!role && !isEveryone && !isHere) return;

    element.append(settings.store.showRoleIcons && role?.icon
        ? createRoleIcon(role)
        : createDefaultIcon());
}

function processRoot(root: ParentNode) {
    if (root instanceof HTMLElement && root.matches(ROLE_MENTION_SELECTOR)) processMention(root);
    root.querySelectorAll<HTMLElement>(ROLE_MENTION_SELECTOR).forEach(processMention);
}

export default definePlugin({
    name: "Role Mention Icons",
    description: "Displays icons next to role mentions.",
    tags: ["Appearance", "Chat", "Roles"],
    authors: [{
        name: "NuzFlameV2",
        id: 1248366351194652712n
    }],

    settings,
    startAt: StartAt.DOMContentLoaded,
    requiresRestart: false,

    start() {
        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof HTMLElement) processRoot(node);
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        processRoot(document.body);
    },

    stop() {
        observer?.disconnect();
        observer = undefined;
        removeAllIcons();
    }
});
