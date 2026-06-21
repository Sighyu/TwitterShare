/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getCurrentChannel, insertTextIntoChatInputBox } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { DraftType, UploadHandler } from "@webpack/common";

import { downloadFile, getTweetText } from "./api";
import { FailedUpload, FxTwitterMedia, FxTwitterTweet, PreparedUploadFiles, ShareMediaItem } from "./types";

const MIME_TO_EXTENSION = new Map([
    ["image/jpeg", "jpg"],
    ["image/jpg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["video/mp4", "mp4"],
    ["application/octet-stream", "bin"],
]);

const URL_EXTENSION_REGEX = /\.([a-z0-9]+)$/i;
const FXTWITTER_GIF_HOST = "gif.fxtwitter.com";
const TWEET_VIDEO_PATH_SEGMENT = "/tweet_video/";
const logger = new Logger("TwitterShare", "#1da1f2");
const MAX_CAPTION_LINES = 12;
const MAX_CAPTION_CHARS = 2000;

export interface MediaUploadMeta {
    filename: string;
    mime: string;
    extension: string;
    gifUsedMp4Fallback: boolean;
}

export function normalizeContentType(contentType?: string) {
    const normalized = contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (!normalized || normalized === "binary/octet-stream") return undefined;
    return normalized;
}

function getUrlPathname(rawUrl?: string) {
    if (!rawUrl) return "";

    try {
        return new URL(rawUrl).pathname;
    } catch {
        return rawUrl.split(/[?#]/, 1)[0];
    }
}

function getUrlExtension(rawUrl?: string) {
    return getUrlPathname(rawUrl).match(URL_EXTENSION_REGEX)?.[1]?.toLowerCase();
}

function isGifLikeMedia(media: FxTwitterMedia) {
    const type = String(media.type).toLowerCase();
    return type.includes("gif") || getUrlPathname(media.url).includes(TWEET_VIDEO_PATH_SEGMENT);
}

function getDownloadableMediaUrls(media: FxTwitterMedia) {
    const urls = [
        media.url,
        ...(Array.isArray(media.formats) ? media.formats.map(format => format.url) : []),
        ...(Array.isArray(media.variants) ? media.variants.map(variant => variant.url) : []),
    ];

    return urls.filter((url, index): url is string => Boolean(url) && urls.indexOf(url) === index);
}

function findExplicitGifUrl(media: FxTwitterMedia) {
    return getDownloadableMediaUrls(media).find(url => getUrlExtension(url) === "gif");
}

function buildFxTwitterGifUrl(rawUrl: string) {
    const pathname = getUrlPathname(rawUrl);
    if (!URL_EXTENSION_REGEX.test(pathname)) return rawUrl;

    return `https://${FXTWITTER_GIF_HOST}${pathname.replace(URL_EXTENSION_REGEX, ".gif")}`;
}

export function getMediaDownloadUrl(media: FxTwitterMedia, preferGif: boolean) {
    if (!media.url || !preferGif || !isGifLikeMedia(media)) return media.url;

    const explicitGifUrl = findExplicitGifUrl(media);
    if (explicitGifUrl) return explicitGifUrl;

    const extension = getUrlExtension(media.url);
    if (extension === "gif") return media.url;

    if (extension === "mp4") {
        return buildFxTwitterGifUrl(media.url);
    }

    return media.url;
}

function getMediaDownloadCandidates(media: FxTwitterMedia, preferGif: boolean) {
    const preferredUrl = getMediaDownloadUrl(media, preferGif);
    const urls = [preferredUrl, ...getDownloadableMediaUrls(media)];

    return urls.filter((url, index): url is string => Boolean(url) && urls.indexOf(url) === index);
}

function inferMimeFromMedia(media: FxTwitterMedia, sourceUrl?: string) {
    if (isGifLikeMedia(media)) return getUrlExtension(sourceUrl ?? media.url) === "gif" ? "image/gif" : "video/mp4";

    switch (media.type) {
        case "photo":
            return "image/jpeg";
        case "video":
            return "video/mp4";
        default:
            return "application/octet-stream";
    }
}

function resolveUploadMime(media: FxTwitterMedia, contentType?: string, sourceUrl?: string) {
    const normalizedContentType = normalizeContentType(contentType);
    if (isGifLikeMedia(media) && getUrlExtension(sourceUrl) === "gif") return "image/gif";

    return normalizedContentType && MIME_TO_EXTENSION.has(normalizedContentType)
        ? normalizedContentType
        : inferMimeFromMedia(media, sourceUrl);
}

function logUploadDebug(message: string, details: Record<string, unknown>) {
    logger.debug(message, details);
}

export function getMediaUploadMeta(tweetId: string, index: number, media: FxTwitterMedia, preferGif: boolean, contentType?: string, sourceUrl = getMediaDownloadUrl(media, preferGif)): MediaUploadMeta {
    const mime = resolveUploadMime(media, contentType, sourceUrl);
    const extension = MIME_TO_EXTENSION.get(mime) ?? "bin";
    const gifUsedMp4Fallback = isGifLikeMedia(media) && preferGif && mime !== "image/gif";

    return {
        filename: `tweet-${tweetId}-${index}.${extension}`,
        mime,
        extension,
        gifUsedMp4Fallback,
    };
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
    if (data instanceof ArrayBuffer) return data;

    const copy = new Uint8Array(data.byteLength);
    copy.set(data);

    return copy.buffer;
}

function getErrorReason(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function buildCaption(tweet: FxTwitterTweet, includeCaption: boolean, includeTweetLink: boolean) {
    const trimmedTweetText = getTweetText(tweet).trim();
    const withoutWrappingQuotes = trimmedTweetText.length >= 2
        && trimmedTweetText.startsWith("\"")
        && trimmedTweetText.endsWith("\"")
        ? trimmedTweetText.slice(1, -1).trim()
        : trimmedTweetText;

    const truncatedCaptionText = withoutWrappingQuotes
        .split(/\r?\n/)
        .slice(0, MAX_CAPTION_LINES)
        .join("\n")
        .slice(0, MAX_CAPTION_CHARS)
        .trim();

    const captionWasTruncated = withoutWrappingQuotes.length > truncatedCaptionText.length
        || withoutWrappingQuotes.split(/\r?\n/).length > MAX_CAPTION_LINES;

    const quotedText = includeCaption && withoutWrappingQuotes
        ? truncatedCaptionText
            .split(/\r?\n/)
            .map(line => `> ${line.trim()}`)
            .join("\n") + (captionWasTruncated ? "\n> ..." : "")
        : "";
    const suppressedEmbedUrl = includeTweetLink && tweet.url?.trim() ? `<${tweet.url.trim()}>` : "";
    const parts = [quotedText, suppressedEmbedUrl].filter(Boolean);

    return parts.join("\n");
}

export function getKnownSelectedBytes(items: ShareMediaItem[]) {
    return items.reduce((total, item) => total + (item.selected ? item.sizeBytes ?? 0 : 0), 0);
}

export function getUnknownSelectedCount(items: ShareMediaItem[]) {
    return items.filter(item => item.selected && item.sizeBytes == null).length;
}

export async function prepareSelectedFiles(tweet: FxTwitterTweet, selectedItems: ShareMediaItem[], preferGif: boolean): Promise<PreparedUploadFiles> {
    const files: File[] = [];
    const failures: FailedUpload[] = [];
    let totalBytes = 0;

    for (const item of selectedItems) {
        const mediaUrls = getMediaDownloadCandidates(item.media, preferGif);
        const fallbackMeta = getMediaUploadMeta(tweet.id, item.index, item.media, preferGif, item.contentType);

        logUploadDebug("Upload candidates", {
            attachment: item.index,
            mediaType: item.media.type,
            preferGif,
            originalUrl: item.media.url,
            candidateUrls: mediaUrls,
            fallbackFilename: fallbackMeta.filename,
        });

        if (mediaUrls.length === 0) {
            failures.push({ index: item.index, filename: fallbackMeta.filename, reason: "missing media URL" });
            continue;
        }

        let lastError: unknown;
        let prepared = false;

        for (const mediaUrl of mediaUrls) {
            try {
                logUploadDebug("Downloading attachment", {
                    attachment: item.index,
                    url: mediaUrl,
                });

                const downloaded = await downloadFile(mediaUrl);
                const data = toArrayBuffer(downloaded.data);
                const meta = getMediaUploadMeta(tweet.id, item.index, item.media, preferGif, downloaded.contentType ?? item.contentType, downloaded.finalUrl ?? mediaUrl);

                logUploadDebug("Prepared attachment", {
                    attachment: item.index,
                    requestedUrl: mediaUrl,
                    finalUrl: downloaded.finalUrl,
                    contentType: downloaded.contentType,
                    filename: meta.filename,
                    mime: meta.mime,
                    bytes: data.byteLength,
                });

                totalBytes += data.byteLength;
                files.push(new File([data], meta.filename, { type: meta.mime }));
                prepared = true;
                break;
            } catch (error) {
                logUploadDebug("Attachment download failed", {
                    attachment: item.index,
                    url: mediaUrl,
                    error: getErrorReason(error),
                });

                lastError = error;
            }
        }

        if (!prepared) {
            failures.push({
                index: item.index,
                filename: fallbackMeta.filename,
                reason: getErrorReason(lastError ?? "download failed"),
            });
        }
    }

    return { files, failures, totalBytes };
}

export async function promptUploadFiles(files: File[], tweet: FxTwitterTweet, includeCaption: boolean, includeTweetLink: boolean) {
    const channel = getCurrentChannel();
    if (!channel) throw new Error("No active channel selected.");

    const caption = buildCaption(tweet, includeCaption, includeTweetLink);
    if (caption) insertTextIntoChatInputBox(`${caption}\n`);

    await UploadHandler.promptToUpload(files, channel, DraftType.ChannelMessage);
}
