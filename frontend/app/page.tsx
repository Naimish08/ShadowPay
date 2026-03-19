'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ConsensusOrb } from '@/components/ConsensusOrb';
import { BlueprintTerminal } from '@/components/BlueprintTerminal';
import { MarketplaceCard } from '@/components/MarketplaceCard';
import { Network, Activity, FileText, ArrowRightLeft } from 'lucide-react';
import { apiFetch } from '@/lib/backend';

interface AgentRow {
  id: string;
  walletAddress: string;
  name: string | null;
  capabilities: string[];
  minPrice: string | null;
  reputationScore: string;
  isActive: boolean;
}

interface CachedPlan {
  tasks?: Array<{ type: string; preferredModel?: string; maxBudgetSepoliaEth?: string }>;
  quote?: { totalMaxCostEth?: string };
  pipeline?: string[];
}

const PLAN_CACHE_KEY = 'aethernet.last.plan';

const classifyType = (agent: AgentRow): 'crypto' | 'web2' => {
  const caps = agent.capabilities.map((cap) => cap.toLowerCase());
  if (caps.some((cap) => cap.includes('web2') || cap.includes('notion') || cap.includes('email') || cap.includes('content'))) {
    return 'web2';
  }
  return 'crypto';
};

const compactAddress = (value: string) =>
  value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;

export default function Home() {
  const [phase, setPhase] = useState<'input' | 'thinking' | 'blueprint' | 'marketplace'>('input');
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [plan, setPlan] = useState<CachedPlan | null>(null);

  // Simulate the architecture flow
  useEffect(() => {
    const sequence = async () => {
      // Input Phase
      setPhase('input');
      await new Promise(r => setTimeout(r, 2000));

      // Thinking Phase (Council Deliberating)
      setPhase('thinking');
      await new Promise(r => setTimeout(r, 5000));

      // Blueprint generated
      setPhase('blueprint');
      await new Promise(r => setTimeout(r, 4000));

      // Marketplace selection
      setPhase('marketplace');
    };

    sequence();
  }, []);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const out = await apiFetch<AgentRow[]>('/api/agents');
        if (mounted) {
          setAgents(out.filter((row) => row.isActive));
        }
      } catch {
        if (mounted) {
          setAgents([]);
        }
      }

      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(PLAN_CACHE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as CachedPlan;
            if (mounted) setPlan(parsed);
          } catch {
            if (mounted) setPlan(null);
          }
        }
      }
    };

    void hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  const topAgents = agents
    .slice()
    .sort((a, b) => Number(b.reputationScore || '0') - Number(a.reputationScore || '0'))
    .slice(0, 4);

  const blueprintPayload = plan
    ? JSON.stringify(
      {
        quote: plan.quote ?? null,
        tasks: plan.tasks ?? [],
        pipeline: (plan.pipeline ?? []).slice(0, 5),
      },
      null,
      2,
    )
    : undefined;

  return (
    <div className="min-h-screen py-10 px-4 sm:px-8 lg:px-16 flex flex-col items-center">

      {/* Cypherpunk Header */}
      <header className="w-full max-w-6xl flex justify-between items-center mb-16">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center space-x-3"
        >
          <div className="w-10 h-10 rounded-full bg-holographic hidden sm:flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(98,126,234,0.5)]">
            E
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tighter text-[#ededed]">Hey <span className="text-[#627EEA]">Elsa</span></h1>
            <p className="text-[10px] sm:text-xs font-mono text-[#a3a3a3] uppercase tracking-widest bg-white/5 py-0.5 px-2 rounded mt-1 inline-block">Middleware Broker</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden md:flex items-center space-x-4 font-mono text-xs text-[#a3a3a3]"
        >
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00A67E] animate-pulse"></span> Network: Sepolia</span>
          <span className="px-3 py-1 bg-[#00A67E]/10 text-[#00A67E] rounded-md border border-[#00A67E]/30">Agents: {agents.length}</span>
          <span className="px-3 py-1 bg-[#627EEA]/10 text-[#627EEA] rounded-md border border-[#627EEA]/30">v1.0.0-rc</span>
        </motion.div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start relative">

        {/* TIER 1 & 2: User Input & Council Thinking */}
        <section className="lg:col-span-5 flex flex-col items-center justify-center space-y-8 mt-10">

          <div className="text-center w-full max-w-md">
            <h2 className="text-3xl font-bold tracking-tight mb-4 leading-tight">
              The Engine of the <span className="text-holographic inline-block">Decentralized Economy</span>
            </h2>
            <p className="text-sm text-[#a3a3a3] font-mono leading-relaxed bg-[#0a0a0a]/50 p-4 rounded-lg border border-white/5">
              &quot;Input command. AI Council formulates strategy. Elsa negotiates and executes via on-chain agents.&quot;
            </p>
          </div>

          <div className="mt-8 flex flex-col items-center">
            <div className="text-xs font-mono text-[#a3a3a3] mb-4 tracking-widest uppercase flex items-center gap-2">
              <Activity size={14} className={phase === 'thinking' ? "text-[#627EEA] animate-spin-slow" : ""} />
              {phase === 'input' ? 'Awaiting Prompt' : 'Tier 2: Council Deliberation'}
            </div>

            {/* The Hero Orb representing the Council */}
            <div className="relative">
              {(phase === 'thinking' || phase === 'blueprint' || phase === 'marketplace') && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -inset-10 bg-[#627EEA]/5 blur-[100px] rounded-full z-0" />
              )}
              <div className="z-10 relative">
                <ConsensusOrb />
              </div>
            </div>
          </div>
        </section>

        {/* Visual Connector for large screens */}
        <div className="hidden lg:flex absolute left-[45%] top-1/2 -translate-y-1/2 w-[10%] justify-center pointer-events-none z-0">
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#627EEA]/30 to-[#627EEA]/30 flex items-center overflow-hidden">
            <motion.div
              className="w-8 h-full bg-[#627EEA] blur-sm"
              animate={{ x: [-50, 200] }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            />
          </div>
        </div>

        {/* TIER 3 & 4: Elsa Orchestration & Agent Marketplace */}
        <section className="lg:col-span-7 flex flex-col gap-8 w-full z-10">

          {/* Blueprint Terminal */}
          <div className="w-full flex justify-center lg:justify-start">
            <BlueprintTerminal
              payloadData={blueprintPayload}
              isThinking={phase === 'input' || phase === 'thinking'}
            />
          </div>

          {/* Smart Contract Hub - Agent Marketplace */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: (phase === 'blueprint' || phase === 'marketplace') ? 1 : 0.3, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`w-full glass-panel rounded-xl p-6 ${phase === 'input' || phase === 'thinking' ? 'pointer-events-none grayscale opacity-30' : ''}`}
          >
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <h3 className="text-sm font-mono tracking-widest text-[#ededed] flex items-center gap-2">
                <Network size={16} className="text-[#627EEA]" />
                SMART_CONTRACT_HUB // MARKETPLACE
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {topAgents.length > 0 ? (
                topAgents.map((agent, index) => {
                  const type = classifyType(agent);
                  const rating = Math.max(0, Math.min(5, Number(agent.reputationScore || '0') / 200));
                  return (
                    <MarketplaceCard
                      key={agent.id}
                      name={agent.name || compactAddress(agent.walletAddress)}
                      type={type}
                      rating={rating}
                      cost={agent.minPrice ? `${agent.minPrice} ETH` : 'n/a'}
                      speed={type === 'crypto' ? 'On-chain' : 'Web2'}
                      icon={type === 'crypto' ? <ArrowRightLeft size={20} /> : <FileText size={20} />}
                      delay={0.1 + (index * 0.1)}
                    />
                  );
                })
              ) : (
                <div className="col-span-2 rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs text-[#a3a3a3]">
                  Agent registry is not reachable yet. Start backend to hydrate the live marketplace panel.
                </div>
              )}
            </div>
          </motion.div>
        </section>

      </main>

    </div>
  );
}
