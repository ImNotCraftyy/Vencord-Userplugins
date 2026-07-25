/*
 * hideChatIcons - Vencord Userplugin
 * Created by NuzFlameV2
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const STYLE = `
[data-vc-cbc-hidden="true"]{display:none!important;}
body.vc-cbc-compact [class*="buttons"]{gap:0!important;}
body.vc-cbc-compact [class*="buttons"]>*{margin-left:0!important;margin-right:0!important;}
`;

const settings = definePluginSettings({
    hideGift:{type:OptionType.BOOLEAN,default:true,description:"Hide Gift"},
    hideApps:{type:OptionType.BOOLEAN,default:true,description:"Hide Apps"},
    hideGif:{type:OptionType.BOOLEAN,default:false,description:"Hide GIF"},
    hideStickers:{type:OptionType.BOOLEAN,default:false,description:"Hide Stickers"},
    hideEmoji:{type:OptionType.BOOLEAN,default:false,description:"Hide Emoji"},
    compactSpacing:{type:OptionType.BOOLEAN,default:false,description:"Compact spacing"}
});

let style: HTMLStyleElement | null = null;

export default definePlugin({
    name: "hideChatIcons",
    description: "Hide Discord and plugin chat icons.",
    authors: [{
        name: "NuzFlameV2",
        id: 1248366351194652712n
    }],
    tags: ["Chat","Customization"],

    settings,

    start() {
        style = document.createElement("style");
        style.textContent = STYLE;
        document.head.appendChild(style);
    },

    stop() {
        style?.remove();
        style = null;
    }
});
