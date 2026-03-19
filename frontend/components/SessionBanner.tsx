'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { getSession } from '@/lib/backend';

const compactAddress = (value: string) =>
    value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;

const decodeTokenExpMs = (token: string): number | null => {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(window.atob(normalized)) as { exp?: number };
        if (!decoded.exp || Number.isNaN(decoded.exp)) return null;
        return decoded.exp * 1000;
    } catch {
        return null;
    }
};

const formatRemaining = (ms: number) => {
    if (ms <= 0) return 'expired';
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
};

export const SessionBanner = () => {
    const [sessionWallet, setSessionWallet] = useState<string | null>(null);
    const [tokenExpMs, setTokenExpMs] = useState<number | null>(null);
    const [now, setNow] = useState<number>(Date.now());

    useEffect(() => {
        const sync = () => {
            const session = getSession();
            setSessionWallet(session?.walletAddress || null);
            setTokenExpMs(session?.token ? decodeTokenExpMs(session.token) : null);
        };

        sync();
        window.addEventListener('storage', sync);
        const timer = window.setInterval(() => setNow(Date.now()), 30000);

        return () => {
            window.removeEventListener('storage', sync);
            window.clearInterval(timer);
        };
    }, []);

    const tokenRemaining = useMemo(() => {
        if (!tokenExpMs) return null;
        return tokenExpMs - now;
    }, [tokenExpMs, now]);

    const connected = Boolean(sessionWallet);
    const tokenValid = tokenRemaining == null ? null : tokenRemaining > 0;
    const shouldReconnect = connected && tokenValid === false;

    const openAuthModal = () => {
        window.dispatchEvent(new Event('aethernet:open-auth-modal'));
    };

    return (
        <div className="pointer-events-none fixed top-3 right-3 z-[900]">
            <div className={`pointer-events-auto rounded-lg border px-3 py-2 backdrop-blur-md ${connected
                ? 'border-[#00A67E]/40 bg-[#00A67E]/10 text-[#D3FFE9]'
                : 'border-[#F3BA2F]/40 bg-[#F3BA2F]/10 text-[#FFE9B2]'
                }`}>
                <div className="flex items-center gap-2 text-[11px] font-mono tracking-wide">
                    {connected ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                    <span>
                        {connected
                            ? `SESSION ${compactAddress(sessionWallet || '')}`
                            : 'NO WALLET SESSION'}
                    </span>
                </div>
                {connected ? (
                    <div className="mt-1 text-[10px] font-mono text-[#A3A3A3]">
                        {tokenRemaining == null
                            ? 'Token expiry unknown'
                            : tokenValid
                                ? `Token valid for ~${formatRemaining(tokenRemaining)}`
                                : 'Token expired - reconnect wallet'}
                    </div>
                ) : (
                    <div className="mt-1 text-[10px] font-mono text-[#A3A3A3]">
                        Connect wallet to unlock execution
                    </div>
                )}

                {(!connected || shouldReconnect) ? (
                    <button
                        type="button"
                        onClick={openAuthModal}
                        className="mt-2 w-full rounded border border-[#627EEA]/40 bg-[#627EEA]/15 px-2 py-1 text-left text-[10px] font-mono tracking-widest text-[#C9D5FF] transition-colors hover:border-[#627EEA] hover:bg-[#627EEA]/25"
                    >
                        {connected ? 'RECONNECT WALLET' : 'CONNECT WALLET'}
                    </button>
                ) : null}
            </div>
        </div>
    );
};
