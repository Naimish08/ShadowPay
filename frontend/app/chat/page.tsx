'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Terminal, Loader2, Database, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiFetch, authHeaders, getSession } from '@/lib/backend';

type ElsaStatus = 'interpreter' | 'negotiator' | 'custodian' | 'bridge' | 'success';

interface ChatMessage {
    id: string;
    role: 'user' | 'system' | 'elsa';
    content: string;
    isJSON?: boolean;
    status?: ElsaStatus;
}

interface HeyElsaPlanResponse {
    tasks?: Array<{ id: number; type: string; maxBudgetSepoliaEth: string }>;
    quote?: {
        totalMaxCostEth: string;
        paymentProtocol: string;
    };
    pipeline?: string[];
}

interface HeyElsaExecuteResponse {
    status: string;
    job?: {
        id: string;
        status: string;
    };
    blueprint?: {
        id: string;
        contentHash: string;
        storageRef: string;
    };
    onChain?: {
        status?: string;
        txHash?: string;
    };
}

const PLAN_CACHE_KEY = 'aethernet.last.plan';
const EXECUTION_CACHE_KEY = 'aethernet.last.execution';

const formatPlanPayload = (plan: HeyElsaPlanResponse) =>
    JSON.stringify(
        {
            tasks: plan.tasks ?? [],
            quote: plan.quote ?? null,
            firstPipelineSteps: (plan.pipeline ?? []).slice(0, 4),
        },
        null,
        2,
    );

export default function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'system',
            content: 'ELSA_OS GATEWAY ENCRYPTED. WAITING FOR USER INTENT.',
        },
    ]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [hasSession, setHasSession] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const syncSession = () => {
            setHasSession(Boolean(getSession()?.token));
        };

        syncSession();
        window.addEventListener('storage', syncSession);
        return () => window.removeEventListener('storage', syncSession);
    }, []);

    const pushElsa = (status: ElsaStatus, content: string) => {
        setMessages((prev) => [
            ...prev,
            {
                id: `${Date.now()}-${Math.random()}`,
                role: 'elsa',
                status,
                content,
            },
        ]);
    };

    const pushSystem = (content: string, isJSON = false) => {
        setMessages((prev) => [
            ...prev,
            {
                id: `${Date.now()}-${Math.random()}`,
                role: 'system',
                content,
                isJSON,
            },
        ]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;

        const userPrompt = input.trim();
        setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-user`, role: 'user', content: userPrompt },
        ]);
        setInput('');
        setIsProcessing(true);

        try {
            pushSystem('REQUEST_RECEIVED. GENERATING ORCHESTRATION CONTRACT...');

            const session = getSession();
            const plan = await apiFetch<HeyElsaPlanResponse>('/api/heyElsa', {
                method: 'POST',
                body: JSON.stringify({
                    userPrompt,
                    walletAddress: session?.walletAddress,
                }),
            });

            pushSystem(formatPlanPayload(plan), true);
            window.localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(plan));

            pushElsa(
                'interpreter',
                `ELSA_OS // PLAN_COMPILED\n> ${plan.tasks?.length ?? 0} subtasks prepared\n> Quote cap: ${plan.quote?.totalMaxCostEth ?? 'n/a'} ETH`,
            );

            if (!session?.token) {
                pushElsa(
                    'custodian',
                    'SESSION_NOT_AUTHENTICATED\n> Connect wallet to execute this plan on the backend.',
                );
                return;
            }

            pushElsa(
                'negotiator',
                'ELSA_OS // QUOTE_ACCEPTED\n> Submitting authenticated execution bootstrap...',
            );

            const execution = await apiFetch<HeyElsaExecuteResponse>('/api/heyElsa/execute', {
                method: 'POST',
                headers: {
                    ...authHeaders(session.token),
                },
                body: JSON.stringify({
                    userPrompt,
                    title: userPrompt.slice(0, 80),
                    acceptQuote: true,
                }),
            });

            window.localStorage.setItem(EXECUTION_CACHE_KEY, JSON.stringify(execution));

            pushElsa(
                'bridge',
                `ELSA_OS // BACKEND_STATE_CREATED\n> Blueprint: ${execution.blueprint?.id ?? 'n/a'}\n> Job: ${execution.job?.id ?? 'n/a'} (${execution.job?.status ?? 'unknown'})`,
            );

            pushElsa(
                'success',
                `ELSA_OS // EXECUTION_BOOTSTRAP_COMPLETE\n> On-chain posting: ${execution.onChain?.status ?? 'unknown'}\n> Next: bids, dispatch, oracle verify, settlement`,
            );
        } catch (error) {
            pushElsa(
                'custodian',
                `ELSA_OS // EXECUTION_ERROR\n> ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="h-screen flex flex-col pt-10 px-4 md:px-8 pb-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <Shield size={200} />
            </div>

            <header className="mb-6 flex justify-between items-end border-b border-[#ffffff10] pb-4 z-10">
                <div>
                    <h1 className="text-2xl font-bold flex items-center text-[#ededed]">
                        <Terminal className="mr-3 text-[#627EEA]" /> Gateway Terminal
                    </h1>
                    <p className="text-[#a3a3a3] text-sm font-mono mt-1">// LIVE_BACKEND_ORCHESTRATION</p>
                </div>
                <div className="hidden sm:flex space-x-4 text-xs font-mono text-[#a3a3a3]">
                    <span className="flex items-center gap-1"><Database size={12} /> API_LINK: ACTIVE</span>
                </div>
            </header>

            <div className={`mb-4 rounded-lg border p-3 text-xs font-mono ${hasSession
                    ? 'border-[#00A67E]/30 bg-[#00A67E]/10 text-[#C9F7E6]'
                    : 'border-[#F3BA2F]/30 bg-[#F3BA2F]/10 text-[#FFE9B2]'
                }`}>
                <div className="flex items-center gap-2 tracking-wide">
                    {hasSession ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                    <span>{hasSession ? 'EXECUTION UNLOCKED' : 'EXECUTION LOCKED'}</span>
                </div>
                <div className="mt-1 text-[#a3a3a3]">
                    {hasSession
                        ? 'Authenticated session detected. Prompts will run planning + execution bootstrap.'
                        : 'No wallet session. Prompt planning still works, but execution bootstrap is skipped until you connect in the sidebar.'}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 pr-2 space-y-6 z-10 custom-scrollbar">
                {messages.map((msg) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] md:max-w-[70%] rounded-xl p-4 shadow-xl border ${msg.role === 'user'
                                ? 'bg-[#627EEA]/10 border-[#627EEA]/30 text-[#ededed]'
                                : 'glass-panel text-[#627EEA] font-mono whitespace-pre-wrap text-sm'
                                }`}
                        >
                            {msg.role === 'system' && !msg.isJSON ? (
                                <span className="block mb-2 text-[#00A67E] text-xs">&gt; SYSTEM:</span>
                            ) : null}
                            {msg.isJSON ? (
                                <div className="bg-black/60 p-3 rounded-lg border border-white/5 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 bg-[#F3BA2F] text-black text-[9px] px-2 py-0.5 rounded-bl-lg font-bold">JSON PAYLOAD</div>
                                    <code>{msg.content}</code>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {msg.role === 'elsa' ? (
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className={`w-2 h-2 rounded-full animate-pulse ${msg.status === 'success' ? 'bg-[#00A67E]' : 'bg-[#627EEA]'}`} />
                                            <span className={`text-[10px] font-mono tracking-widest ${msg.status === 'success' ? 'text-[#00A67E]' : 'text-[#627EEA]'}`}>
                                                ELSA_BROKER // {msg.status?.toUpperCase()}
                                            </span>
                                        </div>
                                    ) : null}
                                    {msg.content}
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}

                {isProcessing ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                        <div className="glass-panel rounded-xl p-4 flex items-center text-[#00A67E] font-mono text-sm leading-none">
                            <Loader2 size={16} className="animate-spin mr-2" />
                            &gt; ORCHESTRATING...
                        </div>
                    </motion.div>
                ) : null}
                <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSubmit} className="z-10 relative mt-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-[#627EEA]/20 to-[#8A2BE2]/20 rounded-xl blur-lg -z-10 pointer-events-none" />
                <div className="glass-panel flex items-center p-2 rounded-xl focus-within:border-[#627EEA] transition-colors">
                    <span className="text-[#a3a3a3] font-mono pl-4 pr-2 select-none">&gt;</span>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isProcessing}
                        autoFocus
                        className="flex-1 bg-transparent border-none outline-none text-[#ededed] p-2 placeholder:text-[#a3a3a3]/50"
                        placeholder="e.g. Build a GTM plan and execute with max 0.01 ETH"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isProcessing}
                        className="p-3 ml-2 bg-[#627EEA] hover:bg-[#4E65CD] disabled:opacity-50 disabled:hover:bg-[#627EEA] transition-colors rounded-lg flex items-center justify-center text-white"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </form>
        </div>
    );
}
