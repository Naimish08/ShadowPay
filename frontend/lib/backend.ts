export interface ApiError extends Error {
    status?: number;
}

export interface SessionState {
    token: string;
    agentId: string;
    walletAddress: string;
}

const SESSION_KEY = "aethernet.session";

const trimSlash = (value: string) => value.replace(/\/$/, "");

const backendBaseUrl = (() => {
    const fromEnv = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
    return fromEnv ? trimSlash(fromEnv) : "";
})();

export const buildApiUrl = (path: string) => {
    if (/^https?:\/\//i.test(path)) return path;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return backendBaseUrl ? `${backendBaseUrl}${normalizedPath}` : normalizedPath;
};

export const apiFetch = async <T>(
    path: string,
    init: RequestInit = {},
): Promise<T> => {
    const res = await fetch(buildApiUrl(path), {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });

    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
        ? await res.json()
        : await res.text();

    if (!res.ok) {
        const error = new Error(
            typeof body === "object" && body && "error" in body
                ? String((body as { error: string }).error)
                : `Request failed with status ${res.status}`,
        ) as ApiError;
        error.status = res.status;
        throw error;
    }

    return body as T;
};

export const getSession = (): SessionState | null => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as SessionState;
        if (!parsed.token || !parsed.agentId || !parsed.walletAddress) return null;
        return parsed;
    } catch {
        return null;
    }
};

export const setSession = (session: SessionState) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearSession = () => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(SESSION_KEY);
};

export const authHeaders = (token?: string | null): HeadersInit => {
    if (!token) return {};
    return {
        Authorization: `Bearer ${token}`,
    };
};
