/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { CloudUploadIcon, LinkIcon } from "@components/Icons";
import { ModalCloseButton as LegacyModalCloseButton, ModalContent as LegacyModalContent, ModalFooter as LegacyModalFooter, ModalHeader as LegacyModalHeader, ModalRoot as LegacyModalRoot, ModalSize } from "@utils/modal";
import { RenderModalProps } from "@vencord/discord-types";
import { React, showToast, TextInput, Toasts } from "@webpack/common";
import type { ComponentType } from "react";

import { downloadFile, fetchTweet, getFileInfo, getPreviewSource, getTweetMedia, getTweetText, isNativeAvailable, TwitterShareError } from "../api";
import { settings } from "../settings";
import { FxTwitterMedia, FxTwitterTweet, ShareMediaItem } from "../types";
import { formatBytes, getKnownSelectedBytes, getMediaDownloadUrl, getUnknownSelectedCount, prepareSelectedFiles, promptUploadFiles } from "../upload";
import { parseTweetUrl } from "../url";
import MediaPicker from "./MediaPicker";

const BYTES_PER_MEGABYTE = 1024 * 1024;
const UPLOAD_TIERS = [
    { key: "free", label: "No Nitro required", range: "0-10 MB", minBytes: 0, maxBytes: 10 * BYTES_PER_MEGABYTE },
    { key: "basic", label: "Nitro Basic required", range: "10-50 MB", minBytes: 10 * BYTES_PER_MEGABYTE, maxBytes: 50 * BYTES_PER_MEGABYTE },
    { key: "nitro", label: "Nitro required", range: "50-500 MB", minBytes: 50 * BYTES_PER_MEGABYTE, maxBytes: 500 * BYTES_PER_MEGABYTE },
] as const;

const ModalRoot = LegacyModalRoot as ComponentType<any>;
const ModalHeader = LegacyModalHeader as ComponentType<any>;
const ModalContent = LegacyModalContent as ComponentType<any>;
const ModalFooter = LegacyModalFooter as ComponentType<any>;
const ModalCloseButton = LegacyModalCloseButton as ComponentType<any>;

type StatusKind = "info" | "success" | "warning" | "error";

interface ModalStatus {
    kind: StatusKind;
    message: string;
    details?: string[];
}

function getErrorMessage(error: unknown) {
    if (error instanceof TwitterShareError) return error.message;
    return error instanceof Error ? error.message : String(error);
}

function makeInitialItems(media: FxTwitterMedia[]) {
    return media.map<ShareMediaItem>((item, mediaIndex) => ({
        id: `${mediaIndex}:${item.url}`,
        index: mediaIndex + 1,
        media: item,
        selected: true,
        previewLoading: true,
        infoLoading: true,
    }));
}

function createObjectUrl(data: ArrayBuffer, contentType?: string) {
    return URL.createObjectURL(new Blob([data], { type: contentType || "application/octet-stream" }));
}

function getTierProgress(bytes: number, minBytes: number, maxBytes: number) {
    if (bytes <= minBytes) return 0;
    if (bytes >= maxBytes) return 100;

    return ((bytes - minBytes) / (maxBytes - minBytes)) * 100;
}

function getUploadTierLabel(bytes: number) {
    if (bytes <= UPLOAD_TIERS[0].maxBytes) return UPLOAD_TIERS[0].label;
    if (bytes <= UPLOAD_TIERS[1].maxBytes) return UPLOAD_TIERS[1].label;
    if (bytes <= UPLOAD_TIERS[2].maxBytes) return UPLOAD_TIERS[2].label;

    return "Above Nitro tier";
}

export default function ShareModal(props: RenderModalProps) {
    const { preferredLanguage } = settings.use(["preferredLanguage"]);

    const [inputUrl, setInputUrl] = React.useState("");
    const [tweet, setTweet] = React.useState<FxTwitterTweet | null>(null);
    const [items, setItems] = React.useState<ShareMediaItem[]>([]);
    const [includeCaption, setIncludeCaption] = React.useState(false);
    const [includeTweetLink, setIncludeTweetLink] = React.useState(false);
    const [preferGif, setPreferGif] = React.useState(true);
    const [loading, setLoading] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [status, setStatus] = React.useState<ModalStatus | null>(null);
    const requestIdRef = React.useRef(0);
    const objectUrlsRef = React.useRef(new Set<string>());

    const selectedItems = React.useMemo(() => items.filter(item => item.selected), [items]);
    const knownSelectedBytes = React.useMemo(() => getKnownSelectedBytes(items), [items]);
    const unknownSelectedCount = React.useMemo(() => getUnknownSelectedCount(items), [items]);

    const revokeObjectUrls = React.useCallback(() => {
        for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
        objectUrlsRef.current.clear();
    }, []);

    React.useEffect(() => revokeObjectUrls, [revokeObjectUrls]);

    const updateItem = React.useCallback((id: string, patch: Partial<ShareMediaItem>) => {
        setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    }, []);

    const hydrateMediaItem = React.useCallback(async (item: ShareMediaItem, requestId: number) => {
        const mediaUrl = getMediaDownloadUrl(item.media, preferGif);
        const previewSource = getPreviewSource(item.media);

        const infoPromise = mediaUrl ? getFileInfo(mediaUrl) : Promise.resolve(null);
        const previewPromise = previewSource
            ? downloadFile(previewSource).then(file => ({ file, source: previewSource }))
            : Promise.resolve(null);

        const [info, preview] = await Promise.allSettled([infoPromise, previewPromise]);
        if (requestIdRef.current !== requestId) return;

        const patch: Partial<ShareMediaItem> = {
            infoLoading: false,
            previewLoading: false,
        };

        if (info.status === "fulfilled" && info.value) {
            patch.contentType = info.value.contentType;
            patch.sizeBytes = info.value.contentLength;
        } else if (info.status === "rejected") {
            patch.infoError = getErrorMessage(info.reason);
        }

        if (preview.status === "fulfilled" && preview.value) {
            const { file, source } = preview.value;
            const objectUrl = createObjectUrl(file.data, file.contentType);
            objectUrlsRef.current.add(objectUrl);
            patch.previewUrl = objectUrl;

            if (source === mediaUrl) {
                patch.contentType ??= file.contentType;
                patch.sizeBytes ??= file.contentLength ?? file.data.byteLength;
            }
        } else if (preview.status === "rejected") {
            patch.previewError = getErrorMessage(preview.reason);
        }

        updateItem(item.id, patch);
    }, [preferGif, updateItem]);

    const hydrateMediaItems = React.useCallback((mediaItems: ShareMediaItem[], requestId: number) => {
        for (const item of mediaItems) void hydrateMediaItem(item, requestId);
    }, [hydrateMediaItem]);

    const handleLoad = React.useCallback(async () => {
        const parsed = parseTweetUrl(inputUrl);
        if (!parsed) {
            setStatus({ kind: "error", message: "Paste a valid Twitter/X status URL." });
            return;
        }

        if (!isNativeAvailable()) {
            setStatus({ kind: "error", message: "Native helper unavailable. Desktop native support is required." });
            return;
        }

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        revokeObjectUrls();
        setLoading(true);
        setTweet(null);
        setItems([]);
        setStatus({ kind: "info", message: "Loading tweet media..." });

        try {
            const loadedTweet = await fetchTweet(parsed.tweetId, preferredLanguage);
            if (requestIdRef.current !== requestId) return;

            const media = getTweetMedia(loadedTweet);
            if (media.length === 0) {
                setStatus({ kind: "error", message: "This tweet has no media attachments." });
                setTweet(loadedTweet);
                return;
            }

            const initialItems = makeInitialItems(media);
            setTweet(loadedTweet);
            setItems(initialItems);
            setStatus(null);
            hydrateMediaItems(initialItems, requestId);
        } catch (error) {
            if (requestIdRef.current === requestId) {
                setStatus({ kind: "error", message: getErrorMessage(error) });
            }
        } finally {
            if (requestIdRef.current === requestId) setLoading(false);
        }
    }, [hydrateMediaItems, inputUrl, preferredLanguage, revokeObjectUrls]);

    const toggleItem = React.useCallback((id: string) => {
        setItems(current => current.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
    }, []);

    const selectAll = React.useCallback((selected: boolean) => {
        setItems(current => current.map(item => ({ ...item, selected })));
    }, []);

    const handleUpload = React.useCallback(async () => {
        if (!tweet) return;

        if (selectedItems.length === 0) {
            setStatus({ kind: "error", message: "Select at least one attachment." });
            return;
        }

        setUploading(true);
        setStatus({ kind: "info", message: "Downloading selected media..." });

        try {
            const prepared = await prepareSelectedFiles(tweet, selectedItems, preferGif);

            if (prepared.files.length === 0) {
                setStatus({
                    kind: "error",
                    message: "No attachments could be prepared for upload.",
                    details: prepared.failures.map(failure => `Attachment ${failure.index}: ${failure.reason}`),
                });
                return;
            }

            await promptUploadFiles(prepared.files, tweet, includeCaption, includeTweetLink);

            const uploadedCount = prepared.files.length;
            if (prepared.failures.length > 0) {
                setStatus({
                    kind: "warning",
                    message: `Uploaded ${uploadedCount} of ${selectedItems.length} attachments.`,
                    details: prepared.failures.map(failure => `Attachment ${failure.index}: ${failure.reason}`),
                });
                return;
            }

            showToast(`Prepared ${uploadedCount} attachment${uploadedCount === 1 ? "" : "s"} for upload.`, Toasts.Type.SUCCESS);
            props.onClose();
        } catch (error) {
            setStatus({ kind: "error", message: getErrorMessage(error) });
        } finally {
            setUploading(false);
        }
    }, [includeCaption, includeTweetLink, preferGif, props, selectedItems, tweet]);

    const author = tweet?.author;
    const tweetText = tweet ? getTweetText(tweet) : "";
    const uploadTierLabel = getUploadTierLabel(knownSelectedBytes);
    const selectedSummary = selectedItems.length > 0
        ? `${selectedItems.length} selected · ${formatBytes(knownSelectedBytes)}${unknownSelectedCount ? ` + ${unknownSelectedCount} unknown` : ""}`
        : "No attachments selected";

    return (
        <ModalRoot {...props} size={ModalSize.LARGE} className="vc-twitter-share-modal" aria-label="TwitterShare">
            <ModalHeader separator={false}>
                <div className="vc-twitter-share-title">
                    <BaseText color="text-strong" size="lg" weight="semibold" tag="h1">
                        TwitterShare
                    </BaseText>
                    <BaseText color="text-subtle" size="sm">
                        FxTwitter media uploader
                    </BaseText>
                </div>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>

            <ModalContent className="vc-twitter-share-content" scrollbarType="thin">
                <div className="vc-twitter-share-load-row">
                    <TextInput
                        value={inputUrl}
                        onChange={setInputUrl}
                        placeholder="https://x.com/user/status/1890000000000000000"
                        disabled={loading || uploading}
                    />
                    <Button type="button" onClick={handleLoad} disabled={loading || uploading}>
                        <span className="vc-twitter-share-button-content">
                            <LinkIcon width={18} height={18} />
                            {loading ? "Loading" : "Load"}
                        </span>
                    </Button>
                </div>

                {status && (
                    <div className={`vc-twitter-share-status vc-twitter-share-status-${status.kind}`}>
                        <BaseText size="sm" weight="semibold" color={status.kind === "error" ? "text-danger" : "text-strong"}>
                            {status.message}
                        </BaseText>
                        {status.details?.length ? (
                            <ul>
                                {status.details.map(detail => <li key={detail}>{detail}</li>)}
                            </ul>
                        ) : null}
                    </div>
                )}

                {tweet && (
                    <div className="vc-twitter-share-tweet-preview">
                        <BaseText size="md" weight="semibold" color="text-strong">
                            {author?.name || author?.screen_name || "Tweet"}
                            {author?.screen_name ? <span className="vc-twitter-share-author"> @{author.screen_name}</span> : null}
                        </BaseText>
                        {tweetText && (
                            <BaseText size="sm" color="text-default" className="vc-twitter-share-tweet-text">
                                {tweetText}
                            </BaseText>
                        )}
                    </div>
                )}

                {tweet && items.length > 0 && (
                    <>
                        <div className="vc-twitter-share-switches">
                            <FormSwitch
                                title="Include tweet"
                                description="Includes the original tweet text as a caption (if available)."
                                value={includeCaption}
                                onChange={setIncludeCaption}
                            />
                            <FormSwitch
                                title="Include Twitter/X link"
                                description="Includes a link to the original tweet."
                                value={includeTweetLink}
                                onChange={setIncludeTweetLink}
                            />
                            <FormSwitch
                                title="Prefer GIF uploads"
                                description="Uses FxTwitter GIF media first, then MP4 fallback."
                                value={preferGif}
                                onChange={setPreferGif}
                            />
                        </div>

                        <MediaPicker
                            tweetId={tweet.id}
                            items={items}
                            preferGif={preferGif}
                            onToggle={toggleItem}
                            onSelectAll={selectAll}
                        />
                    </>
                )}
            </ModalContent>

            <ModalFooter>
                <div className="vc-twitter-share-footer">
                    <div className="vc-twitter-share-size-meter">
                        <div className="vc-twitter-share-size-header">
                            <BaseText size="sm" weight="semibold" color="text-strong">
                                {selectedSummary}
                            </BaseText>
                            <BaseText size="xs" color="text-subtle">
                                {uploadTierLabel}
                            </BaseText>
                        </div>
                        <div
                            className="vc-twitter-share-progress"
                            role="meter"
                            aria-valuemin={0}
                            aria-valuemax={500}
                            aria-valuenow={Math.min(500, knownSelectedBytes / BYTES_PER_MEGABYTE)}
                            aria-valuetext={`${formatBytes(knownSelectedBytes)} selected`}
                        >
                            {UPLOAD_TIERS.map(tier => (
                                <div key={tier.key} className={`vc-twitter-share-progress-segment vc-twitter-share-progress-${tier.key}`}>
                                    <span style={{ width: `${getTierProgress(knownSelectedBytes, tier.minBytes, tier.maxBytes)}%` }} />
                                </div>
                            ))}
                        </div>
                        <div className="vc-twitter-share-tier-labels">
                            {UPLOAD_TIERS.map(tier => (
                                <div key={tier.key}>
                                    <BaseText size="xs" weight="semibold" color="text-strong">{tier.label}</BaseText>
                                    <BaseText size="xs" color="text-subtle">{tier.range}</BaseText>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="vc-twitter-share-actions">
                        <Button
                            type="button"
                            onClick={handleUpload}
                            disabled={!tweet || selectedItems.length === 0 || loading || uploading}
                        >
                            <span className="vc-twitter-share-button-content">
                                <CloudUploadIcon width={18} height={18} />
                                {uploading ? "Uploading" : "Upload"}
                            </span>
                        </Button>
                    </div>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}
