'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ConsensusOrb } from '@/components/ConsensusOrb';
import { BlueprintTerminal } from '@/components/BlueprintTerminal';
import { ActivitySquare, Fingerprint, Network, Brain } from 'lucide-react';
import { apiFetch } from '@/lib/backend';

interface JobRow {
    id: string;
    status: 'open' | 'bidding' | 'in_progress' | 'delivered' | 'completed' | 'disputed';
}

interface AgentRow {
    id: string;
}

interface CachedPlan {
    tasks?: Array<{ type: string; preferredModel?: string; maxBudgetSepoliaEth?: string }>;
    pipeline?: string[];
    quote?: { totalMaxCostEth?: string };
}

const PLAN_CACHE_KEY = 'aethernet.last.plan';

const fallbackLogs = [
    '> Awaiting live orchestration payload...',
    '> Submit an intent in Terminal to hydrate this dashboard.',
];

export default function DashboardPage() {
    const [jobs, setJobs] = useState<JobRow[]>([]);
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [plan, setPlan] = useState<CachedPlan | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const raw = window.localStorage.getItem(PLAN_CACHE_KEY);
        if (!raw) return;
        try {
            setPlan(JSON.parse(raw) as CachedPlan);
        } catch {
            setPlan(null);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            try {
                setLoading(true);
                const [jobsOut, agentsOut] = await Promise.all([
                    apiFetch<JobRow[]>('/api/jobs'),
                    apiFetch<AgentRow[]>('/api/agents'),
                ]);
                if (!mounted) return;
                setJobs(jobsOut);
                setAgents(agentsOut);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void load();
        return () => {
            mounted = false;
        };
    }, []);

    const statusCounts = useMemo(() => {
        return jobs.reduce(
            (acc, job) => {
                acc[job.status] = (acc[job.status] || 0) + 1;
                return acc;
            },
            {
                open: 0,
                bidding: 0,
                in_progress: 0,
                delivered: 0,
                completed: 0,
                disputed: 0,
            } as Record<JobRow['status'], number>,
        );
    }, [jobs]);

    const models = [
        {
            name: 'GEMINI',
            role: 'Deep Research & Fact-Checking',
            color: 'from-[#8A2BE2]/20 to-transparent',
            borderColor: 'border-[#8A2BE2]/50',
            textColor: 'text-[#8A2BE2]',
            logs: plan?.tasks?.filter((t) => (t.preferredModel || '').toLowerCase() === 'gemini').map((t) => `> Task: ${t.type} | cap: ${t.maxBudgetSepoliaEth || 'n/a'} ETH`) || fallbackLogs,
        },
        {
            name: 'GPT',
            role: 'Strategic Planning',
            color: 'from-[#00A67E]/20 to-transparent',
            borderColor: 'border-[#00A67E]/50',
            textColor: 'text-[#00A67E]',
            logs: plan?.tasks?.filter((t) => (t.preferredModel || '').toLowerCase() === 'gpt').map((t) => `> Task: ${t.type} | cap: ${t.maxBudgetSepoliaEth || 'n/a'} ETH`) || fallbackLogs,
        },
        {
            name: 'CLAUDE',
            role: 'Security Audit',
            color: 'from-[#D97757]/20 to-transparent',
            borderColor: 'border-[#D97757]/50',
            textColor: 'text-[#D97757]',
            logs: plan?.tasks?.filter((t) => (t.preferredModel || '').toLowerCase() === 'claude').map((t) => `> Task: ${t.type} | cap: ${t.maxBudgetSepoliaEth || 'n/a'} ETH`) || fallbackLogs,
        },
        {
            name: 'GROK',
            role: 'Real-time Sentiment',
            color: 'from-[#FFFFFF]/20 to-transparent',
            borderColor: 'border-white/50',
            textColor: 'text-white',
            logs: plan?.tasks?.filter((t) => (t.preferredModel || '').toLowerCase() === 'grok').map((t) => `> Task: ${t.type} | cap: ${t.maxBudgetSepoliaEth || 'n/a'} ETH`) || fallbackLogs,
        },
    ];

    const blueprintPayload = JSON.stringify(
        {
            quote: plan?.quote || null,
            tasks: plan?.tasks || [],
            pipeline: (plan?.pipeline || []).slice(0, 6),
            liveStats: {
                jobs: jobs.length,
                agents: agents.length,
                completed: statusCounts.completed,
                disputed: statusCounts.disputed,
            },
        },
        null,
        2,
    );

    return (
        <div className="min-h-screen p-4 md:p-8 overflow-y-auto w-full custom-scrollbar">
            <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between border-b border-[#ffffff10] pb-4 gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center text-[#ededed]">
                        <ActivitySquare className="mr-3 text-[#627EEA]" /> Council Deliberation
                    </h1>
                    <p className="text-[#a3a3a3] text-sm font-mono mt-1">// LIVE_CONSENSUS_TELEMETRY</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono text-[#a3a3a3]">
                    <span className="flex items-center gap-1"><Fingerprint size={12} /> AGENTS: {agents.length}</span>
                    <span className="flex items-center gap-1"><Network size={12} /> JOBS: {jobs.length}</span>
                    <span className="flex items-center gap-1">COMPLETED: {statusCounts.completed}</span>
                    <span className="flex items-center gap-1">DISPUTED: {statusCounts.disputed}</span>
                    {loading ? <span className="text-[#F3BA2F]">SYNCING...</span> : null}
                </div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 w-full max-w-[1400px] mx-auto">
                <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {models.map((model, idx) => (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            key={model.name}
                            className={`glass-panel border-t-2 ${model.borderColor} p-4 rounded-xl flex flex-col h-64`}
                        >
                            <div className="flex justify-between items-center mb-3">
                                <span className={`font-bold font-mono text-sm ${model.textColor}`}>{model.name}</span>
                                <Brain size={14} className={model.textColor} />
                            </div>
                            <div className="text-[10px] text-[#a3a3a3] uppercase tracking-widest mb-4 border-b border-white/5 pb-2">
                                {model.role}
                            </div>

                            <div className="flex-[1] overflow-y-auto custom-scrollbar font-mono text-xs space-y-2 text-[#d4d4d4]">
                                {model.logs.map((log, i) => (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.4 + i * 0.2 }}
                                        key={`${model.name}-${i}`}
                                    >
                                        {log}
                                    </motion.div>
                                ))}
                                <motion.div
                                    animate={{ opacity: [1, 0, 1] }}
                                    transition={{ repeat: Infinity, duration: 1 }}
                                    className={`h-3 w-2 ${model.name === 'GROK' ? 'bg-white' : 'bg-current'} inline-block ${model.textColor} mt-2`}
                                />
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className="xl:col-span-5 flex flex-col items-center justify-center space-y-12 bg-black/40 rounded-2xl border border-white/5 p-8 relative overflow-hidden">
                    <div className="absolute top-1/4 select-none pointer-events-none left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[#627EEA]/10 rounded-full blur-[100px]" />

                    <div className="text-center w-full z-10">
                        <h3 className="text-[#ededed] font-bold text-lg mb-2 tracking-wide">Synthesizing Consensus</h3>
                        <p className="text-[#a3a3a3] text-xs font-mono">Live orchestration + registry telemetry</p>
                    </div>

                    <div className="z-10 scale-90">
                        <ConsensusOrb />
                    </div>

                    <div className="w-full z-10 mt-auto">
                        <h4 className="text-[10px] font-mono text-[#a3a3a3] uppercase tracking-widest mb-2 border-b border-white/10 pb-1">Generated Output Payload:</h4>
                        <BlueprintTerminal payloadData={blueprintPayload} isThinking={loading && !plan} />
                    </div>
                </div>
            </div>
        </div>
    );
}
