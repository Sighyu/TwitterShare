/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const FXTWITTER_USER_AGENT = "FxVencordShare/1.0 (+https://github.com/Equicord/Equicord)";

export type FxTwitterMediaType = "photo" | "video" | "gif";

export interface FxTwitterAuthor {
    name?: string;
    screen_name?: string;
}

export interface FxTwitterTranslation {
    text?: string;
    source_lang?: string;
    target_lang?: string;
    source_language?: string;
    target_language?: string;
    source?: string;
    target?: string;
    [key: string]: unknown;
}

export interface FxTwitterMediaFormat {
    url?: string;
    bitrate?: number;
    container?: string;
    codec?: string;
}

export interface FxTwitterMediaVariant {
    url?: string;
    bitrate?: number;
    content_type?: string;
}

export interface FxTwitterMedia {
    type: FxTwitterMediaType | string;
    url?: string;
    thumbnail_url?: string;
    format?: string;
    formats?: FxTwitterMediaFormat[];
    variants?: FxTwitterMediaVariant[];
    width?: number;
    height?: number;
    duration?: number;
    [key: string]: unknown;
}

export interface FxTwitterTweet {
    id: string;
    url?: string;
    text?: string;
    translation?: FxTwitterTranslation;
    author?: FxTwitterAuthor;
    media?: {
        all?: FxTwitterMedia[];
        photos?: FxTwitterMedia[];
        videos?: FxTwitterMedia[];
        [key: string]: unknown;
    };
}

export interface FxTwitterResponse {
    code?: number;
    message?: string;
    tweet?: FxTwitterTweet;
}

export interface NativeFileInfo {
    contentType?: string;
    contentLength?: number;
    finalUrl?: string;
    status?: number;
}

export interface NativeDownloadFileResult extends NativeFileInfo {
    data: ArrayBuffer;
}

export interface ShareMediaItem {
    id: string;
    index: number;
    media: FxTwitterMedia;
    selected: boolean;
    previewLoading: boolean;
    infoLoading: boolean;
    previewUrl?: string;
    previewError?: string;
    contentType?: string;
    sizeBytes?: number;
    infoError?: string;
}

export interface FailedUpload {
    index: number;
    filename: string;
    reason: string;
}

export interface PreparedUploadFiles {
    files: File[];
    totalBytes: number;
    failures: FailedUpload[];
}
