/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { classes } from "@utils/misc";

import { ShareMediaItem } from "../types";
import { formatBytes, getMediaUploadMeta } from "../upload";

interface MediaPickerProps {
    tweetId: string;
    items: ShareMediaItem[];
    preferGif: boolean;
    onToggle(id: string): void;
    onSelectAll(selected: boolean): void;
}

function formatType(type: string) {
    return type.toUpperCase();
}

function formatDuration(duration?: number) {
    if (typeof duration !== "number") return null;
    return `${duration.toFixed(duration >= 10 ? 0 : 1)}s`;
}

function getMediaDetails(item: ShareMediaItem, preferGif: boolean, tweetId: string) {
    const details = [formatType(item.media.type)];
    const dimensions = item.media.width && item.media.height ? `${item.media.width}x${item.media.height}` : null;
    const duration = formatDuration(item.media.duration);
    const meta = getMediaUploadMeta(tweetId, item.index, item.media, preferGif, item.contentType);

    if (dimensions) details.push(dimensions);
    if (duration) details.push(duration);
    if (item.sizeBytes != null) details.push(formatBytes(item.sizeBytes));

    return {
        text: details.join(" · "),
        extension: meta.extension,
        fallback: meta.gifUsedMp4Fallback,
    };
}

export default function MediaPicker({ tweetId, items, preferGif, onToggle, onSelectAll }: MediaPickerProps) {
    const selectedCount = items.filter(item => item.selected).length;
    const allSelected = selectedCount === items.length && items.length > 0;

    return (
        <section className="vc-twitter-share-picker">
            <div className="vc-twitter-share-picker-header">
                <BaseText size="md" weight="semibold" color="text-strong">
                    Attachments
                </BaseText>
                <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    onClick={() => onSelectAll(!allSelected)}
                    disabled={items.length === 0}
                >
                    {allSelected ? "Deselect all" : "Select all"}
                </Button>
            </div>

            <div className="vc-twitter-share-media-grid">
                {items.map(item => {
                    const details = getMediaDetails(item, preferGif, tweetId);

                    return (
                        <label
                            key={item.id}
                            className={classes("vc-twitter-share-media-item", item.selected && "vc-twitter-share-media-selected")}
                        >
                            <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => onToggle(item.id)}
                                aria-label={`Select attachment ${item.index}`}
                            />
                            <div className="vc-twitter-share-preview-frame">
                                {item.previewUrl ? (
                                    <img src={item.previewUrl} alt={`Attachment ${item.index} preview`} />
                                ) : (
                                    <div className="vc-twitter-share-preview-placeholder">
                                        {item.previewLoading ? "Loading" : item.media.type.toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="vc-twitter-share-media-copy">
                                <BaseText size="sm" weight="semibold" color="text-strong">
                                    Attachment {item.index}
                                </BaseText>
                                <div className="vc-twitter-share-media-meta">
                                    <BaseText size="xs" color="text-subtle" className="vc-twitter-share-media-details">
                                        {details.text}
                                    </BaseText>
                                    <span className="vc-twitter-share-media-badge">.{details.extension}</span>
                                    {details.fallback && <span className="vc-twitter-share-media-badge vc-twitter-share-media-badge-warning">MP4 fallback</span>}
                                </div>
                                {item.previewError && (
                                    <BaseText size="xs" color="text-danger">
                                        Preview unavailable
                                    </BaseText>
                                )}
                            </div>
                        </label>
                    );
                })}
            </div>
        </section>
    );
}
