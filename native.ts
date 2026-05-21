/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

import { FXTWITTER_USER_AGENT, NativeDownloadFileResult, NativeFileInfo } from "./types";

const DEFAULT_TIMEOUT_MS = 20_000;

function assertHttpUrl(rawUrl: string) {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only HTTP(S) URLs are supported");
    }

    return url.toString();
}

function buildHeaders(headers?: Record<string, string>) {
    return {
        "User-Agent": FXTWITTER_USER_AGENT,
        Accept: "*/*",
        ...headers,
    };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("REQUEST_TIMEOUT");
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function throwHttpError(response: Response, body?: string): never {
    const detail = body?.trim() || response.statusText || "Request failed";
    throw new Error(`HTTP_STATUS:${response.status}:${detail.slice(0, 300)}`);
}

function getContentLength(headers: Headers) {
    const contentRange = headers.get("content-range");
    const totalFromRange = contentRange?.match(/\/(\d+)$/)?.[1];
    const rawLength = totalFromRange ?? headers.get("content-length");
    if (!rawLength) return undefined;

    const parsed = Number(rawLength);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function getContentType(headers: Headers) {
    return headers.get("content-type") ?? undefined;
}

export async function nativeHttpGetJson<T = unknown>(_: IpcMainInvokeEvent, rawUrl: string, headers?: Record<string, string>): Promise<T> {
    const url = assertHttpUrl(rawUrl);
    const response = await fetchWithTimeout(url, {
        method: "GET",
        headers: buildHeaders({
            Accept: "application/json",
            ...headers,
        }),
    });

    const text = await response.text();
    if (!response.ok) throwHttpError(response, text);

    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error("INVALID_JSON_RESPONSE");
    }
}

export async function nativeGetFileInfo(_: IpcMainInvokeEvent, rawUrl: string): Promise<NativeFileInfo> {
    const url = assertHttpUrl(rawUrl);
    const response = await fetchWithTimeout(url, {
        method: "HEAD",
        headers: buildHeaders(),
    });

    if (!response.ok) throwHttpError(response);

    return {
        contentType: getContentType(response.headers),
        contentLength: getContentLength(response.headers),
        finalUrl: response.url,
        status: response.status,
    };
}

export async function nativeDownloadFile(_: IpcMainInvokeEvent, rawUrl: string): Promise<NativeDownloadFileResult> {
    const url = assertHttpUrl(rawUrl);
    const response = await fetchWithTimeout(url, {
        method: "GET",
        headers: buildHeaders(),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throwHttpError(response, text);
    }

    const data = await response.arrayBuffer();
    return {
        data,
        contentType: getContentType(response.headers),
        contentLength: getContentLength(response.headers) ?? data.byteLength,
        finalUrl: response.url,
        status: response.status,
    };
}
