'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Search, Filter, Star, Clock, ArrowRightLeft, FileText, Shield } from 'lucide-react';
import { apiFetch } from '@/lib/backend';

type AgentCategory = 'CRYPTO' | 'WEB2' | 'SECURITY';

interface AgentRow {
    id: string;
    walletAddress: string;
    name: string | null;
    ensName: string | null;
    capabilities: string[];
    minPrice: string | null;
    reputationScore: string;
    isActive: boolean;
}

const classifyAgent = (agent: AgentRow): AgentCategory => {
    const caps = agent.capabilities.map((cap) => cap.toLowerCase());
    if (caps.some((cap) => cap.includes('audit') || cap.includes('security') || cap.includes('oracle'))) {
        return 'SECURITY';
    }
    if (caps.some((cap) => cap.includes('web2') || cap.includes('notion') || cap.includes('email') || cap.includes('content'))) {
        return 'WEB2';
    }
    return 'CRYPTO';
};

const iconForType = (type: AgentCategory) => {
    if (type === 'WEB2') return FileText;
    if (type === 'SECURITY') return Shield;
    return ArrowRightLeft;
};

const colorForType = (type: AgentCategory) => {
    if (type === 'WEB2') return 'bg-[#F3BA2F]/20 text-[#F3BA2F]';
    if (type === 'SECURITY') return 'bg-[#FF4F4F]/20 text-[#FF4F4F]';
    return 'bg-[#627EEA]/20 text-[#627EEA]';
};

const compactAddress = (value: string) =>
    value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;

export default function MarketplacePage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'ALL' | AgentCategory>('ALL');
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const out = await apiFetch<AgentRow[]>('/api/agents');
                if (mounted) setAgents(out.filter((row) => row.isActive));
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch agents');
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void load();
        return () => {
            mounted = false;
        };
    }, []);

    const filteredAgents = useMemo(() => {
        return agents.filter((agent) => {
            const type = classifyAgent(agent);
            const matchesType = filterType === 'ALL' || filterType === type;
            const text = `${agent.name || ''} ${agent.ensName || ''} ${agent.walletAddress}`.toLowerCase();
            const matchesSearch = text.includes(searchTerm.toLowerCase());
            return matchesType && matchesSearch;
        });
    }, [agents, filterType, searchTerm]);

    return (
        <div className="min-h-screen p-4 md:p-8 w-full max-w-[1400px] mx-auto">
            <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-[#ffffff10] pb-4 gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center text-[#ededed]">
                        <ShoppingCart className="mr-3 text-[#627EEA]" /> Smart Contract Hub
                    </h1>
                    <p className="text-[#a3a3a3] text-sm font-mono mt-1">// LIVE_AGENT_REGISTRY</p>
                </div>
                <div className="flex space-x-4 text-xs font-mono">
                    <span className="px-3 py-1 bg-[#F3BA2F]/10 text-[#F3BA2F] rounded-md border border-[#F3BA2F]/30 flex items-center gap-2">
                        <Star size={12} /> {filteredAgents.length} ACTIVE AGENTS
                    </span>
                </div>
            </header>

            <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="glass-panel flex-1 flex items-center p-3 rounded-xl">
                    <Search size={18} className="text-[#a3a3a3] ml-2 mr-3" />
                    <input
                        type="text"
                        placeholder="Search agents by name, ENS, or wallet..."
                        className="bg-transparent border-none outline-none text-[#ededed] w-full text-sm font-mono placeholder:text-[#a3a3a3]/50"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="glass-panel flex items-center p-1 rounded-xl gap-1 overflow-x-auto custom-scrollbar whitespace-nowrap">
                    <div className="px-3 text-[#a3a3a3]"><Filter size={16} /></div>
                    {(['ALL', 'CRYPTO', 'WEB2', 'SECURITY'] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${filterType === type ? 'bg-[#627EEA] text-white' : 'text-[#a3a3a3] hover:bg-white/5'
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="glass-panel rounded-2xl p-6 text-[#a3a3a3] font-mono text-sm">Loading agent registry...</div>
            ) : error ? (
                <div className="glass-panel rounded-2xl p-6 text-[#FFB4B4] font-mono text-sm border border-[#FF4F4F]/30">{error}</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAgents.map((agent, index) => {
                        const type = classifyAgent(agent);
                        const Icon = iconForType(type);
                        const rep = Number(agent.reputationScore || '0');
                        const stars = Math.max(0, Math.min(5, rep / 200));

                        return (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05 }}
                                key={agent.id}
                                className="glass-panel p-5 rounded-2xl flex flex-col hover:bg-white/5 hover:border-[#627EEA]/50 transition-colors"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-3 rounded-xl ${colorForType(type)}`}>
                                        <Icon size={24} />
                                    </div>

                                    <div className="flex flex-col items-end">
                                        <div className="flex items-center text-[#F3BA2F] space-x-1 mb-1">
                                            <Star size={16} fill="#F3BA2F" />
                                            <span className="font-bold text-lg">{stars.toFixed(1)}</span>
                                        </div>
                                        <span className="text-[10px] text-[#a3a3a3] uppercase tracking-wider">Rep {rep.toFixed(0)}/1000</span>
                                    </div>
                                </div>

                                <div>
                                    <h2 className="text-xl font-bold text-[#ededed]">{agent.name || 'Unnamed Agent'}</h2>
                                    <p className="font-mono text-xs text-[#627EEA] mt-1">{agent.ensName || compactAddress(agent.walletAddress)}</p>
                                </div>

                                <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-3 gap-2">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-[#a3a3a3] uppercase mb-1">Type</span>
                                        <span className="text-sm font-mono text-[#ededed]">{type}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-[#a3a3a3] uppercase mb-1 flex items-center gap-1"><Clock size={10} /> Price</span>
                                        <span className="text-sm font-mono text-[#ededed]">{agent.minPrice || 'n/a'} ETH</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-[#a3a3a3] uppercase mb-1">Caps</span>
                                        <span className="text-sm font-mono text-[#00A67E]">{agent.capabilities.length}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
