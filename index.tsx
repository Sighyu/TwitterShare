/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { CloudUploadIcon } from "@components/Icons";
import { openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

import ShareModal from "./components/ShareModal";
import { settings } from "./settings";
import managedStyle from "./style.css?managed";

function openTwitterShareModal() {
    openModal(props => <ShareModal {...props} />);
}

const channelAttachMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props.channel) return;

    if (children.some(child => child?.props?.id === "vc-twitter-share")) return;

    children.push(
        <Menu.MenuItem
            id="vc-twitter-share"
            label="Share Twitter/X media"
            iconLeft={CloudUploadIcon}
            action={openTwitterShareModal}
        />
    );
};

export default definePlugin({
    name: "TwitterShare",
    description: "Shares Twitter/X media through the FxTwitter API.",
    authors: [{ name: "Ryu", id: 1020416187219316766n }],
    settings,
    managedStyle,
    tags: ["Chat", "Media"],

    contextMenus: {
        "channel-attach": channelAttachMenuPatch,
    },

    toolboxActions: {
        "Share Twitter/X Media": openTwitterShareModal,
    },
});
