/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";

import { DEFAULT_TRANSLATION_LANGUAGE, getTranslationLanguageCode } from "./settings";
import { FXTWITTER_USER_AGENT, FxTwitterMedia, FxTwitterResponse, FxTwitterTweet, NativeDownloadFileResult, NativeFileInfo } from "./types";

const API_BASE_URL = "https://api.fxtwitter.com";

const Native = VencordNative?.pluginHelpers?.TwitterShare as PluginNative<typeof import("./native")> | undefined;

export class TwitterShareError extends Error {
    constructor(public code: string, message: string) {
        super(message);
        this.name = "TwitterShareError";
    }
}

export function isNativeAvailable() {
    return !IS_WEB
        && typeof Native?.nativeHttpGetJson === "function"
        && typeof Native.nativeDownloadFile === "function";
}

function getNative() {
    if (!isNativeAvailable()) {
        throw new TwitterShareError("native-unavailable", "TwitterShare needs desktop native support for FxTwitter requests.");
    }

    return Native!;
}

export function buildTweetApiUrl(tweetId: string, language: unknown = DEFAULT_TRANSLATION_LANGUAGE) {
    return `${API_BASE_URL}/status/${tweetId}/${encodeURIComponent(getTranslationLanguageCode(language))}`;
}

export function getTweetText(tweet: FxTwitterTweet) {
    const translatedText = tweet.translation?.text?.trim();
    return translatedText || tweet.text?.trim() || "";
}

function mapStatusError(status: number) {
    if (status === 401) {
        return new TwitterShareError("protected", "This tweet is private or protected.");
    }

    if (status === 404) {
        return new TwitterShareError("not-found", "This tweet was not found or has been deleted.");
    }

    return new TwitterShareError("network", `FxTwitter request failed with HTTP ${status}.`);
}

function mapNativeError(error: unknown) {
    if (error instanceof TwitterShareError) return error;

    const message = error instanceof Error ? error.message : String(error);
    const status = message.match(/HTTP_STATUS:(\d+)/)?.[1];
    if (status) return mapStatusError(Number(status));

    if (/REQUEST_TIMEOUT|timeout|aborted/i.test(message)) {
        return new TwitterShareError("timeout", "FxTwitter request timed out. Try again in a moment.");
    }

    if (/INVALID_JSON_RESPONSE/i.test(message)) {
        return new TwitterShareError("invalid-response", "FxTwitter returned an invalid response.");
    }

    return new TwitterShareError("network", "Could not reach FxTwitter or the media host.");
}

function validateTweetResponse(response: FxTwitterResponse): FxTwitterTweet {
    const code = response.code ?? 200;
    if (code !== 200) {
        if (code === 401) throw mapStatusError(401);
        if (code === 404) throw mapStatusError(404);
        throw new TwitterShareError("api", response.message || `FxTwitter returned code ${code}.`);
    }

    if (!response.tweet) {
        throw new TwitterShareError("invalid-response", "FxTwitter response did not include tweet data.");
    }

    return response.tweet;
}

export async function fetchTweet(tweetId: string, language?: unknown): Promise<FxTwitterTweet> {
    try {
        const response = await getNative().nativeHttpGetJson(buildTweetApiUrl(tweetId, language), {
            "User-Agent": FXTWITTER_USER_AGENT,
            Accept: "application/json",
        }) as FxTwitterResponse;

        return validateTweetResponse(response);
    } catch (error) {
        throw mapNativeError(error);
    }
}

export function getTweetMedia(tweet: FxTwitterTweet): FxTwitterMedia[] {
    const allMedia = tweet.media?.all;
    const fallbackMedia = [
        ...(tweet.media?.photos ?? []),
        ...(tweet.media?.videos ?? []),
    ];

    const media = Array.isArray(allMedia) && allMedia.length > 0 ? allMedia : fallbackMedia;
    const seen = new Set<string>();

    return media.filter(item => {
        if (!item?.url) return false;

        const key = `${item.type}:${item.url}:${item.thumbnail_url ?? ""}`;
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

export function getPreviewSource(media: FxTwitterMedia) {
    if (media.type === "photo") return media.url;
    return media.thumbnail_url || undefined;
}

export async function getFileInfo(url: string): Promise<NativeFileInfo | null> {
    try {
        return await getNative().nativeGetFileInfo(url);
    } catch {
        return null;
    }
}

export async function downloadFile(url: string): Promise<NativeDownloadFileResult> {
    try {
        return await getNative().nativeDownloadFile(url);
    } catch (error) {
        throw mapNativeError(error);
    }
}
