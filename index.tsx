/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { CloudUploadIcon } from "@components/Icons";
import { openModal } from "@utils/modal";
import definePlugin from "@utils/types";

import ShareModal from "./components/ShareModal";
import { settings } from "./settings";
import managedStyle from "./style.css?managed";

function openTwitterShareModal() {
    openModal(props => <ShareModal {...props} />);
}

function TwitterShareChatButton(props) {
    if (!props.isMainChat) return null;

    return (
        <ChatBarButton
            tooltip="Share Twitter/X media"
            onClick={openTwitterShareModal}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <CloudUploadIcon width={24} height={24} />
        </ChatBarButton>
    );
}

export default definePlugin({
    name: "TwitterShare",
    description: "Shares Twitter/X media through the FxTwitter API.",
    authors: [{ name: "Ryu", id: 1020416187219316766n }],
    settings,
    managedStyle,
    tags: ["Chat", "Media"],

    chatBarButton: {
        icon: CloudUploadIcon,
        render: TwitterShareChatButton,
    },

    toolboxActions: {
        "Share Twitter/X Media": openTwitterShareModal,
    },
});
