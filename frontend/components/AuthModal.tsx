'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Wallet, Fingerprint, Hexagon } from 'lucide-react';
import { BrowserProvider, getAddress } from 'ethers';
import { SiweMessage } from 'siwe';
import { apiFetch, setSession } from '@/lib/backend';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletName: string, walletAddress: string) => void;
}

export const AuthModal = ({ isOpen, onClose, onConnect }: AuthModalProps) => {
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const buildSiweMessage = (input: {
    address: string;
    nonce: string;
    chainId: number;
  }) => {
    const origin = process.env.NEXT_PUBLIC_SIWE_ORIGIN || window.location.origin;
    const domain = new URL(origin).hostname;
    const checksummedAddress = getAddress(input.address);

    const siweMessage = new SiweMessage({
      domain,
      address: checksummedAddress,
      uri: origin,
      version: '1',
      chainId: input.chainId,
      nonce: input.nonce,
      statement: 'Sign in to Hey Elsa and authorize the orchestration session.',
      issuedAt: new Date().toISOString(),
    });

    return siweMessage.prepareMessage();
  };

  const handleConnect = async (walletName: string) => {
    try {
      setConnectingTo(walletName);
      setErrorMessage(null);

      // Check if window.ethereum is available
      if (!window.ethereum) {
        setErrorMessage('No Web3 wallet detected. Please install MetaMask or Brave Wallet.');
        setConnectingTo(null);
        return;
      }

      // Get the correct provider - handle multiple wallet scenario
      let ethereumProvider = window.ethereum;

      // If multiple wallets are installed, window.ethereum.providers will exist
      if (window.ethereum.providers?.length) {
        // Find MetaMask specifically when user selects MetaMask
        if (walletName === 'MetaMask') {
          ethereumProvider = window.ethereum.providers.find((p: any) => p.isMetaMask && !p.isBraveWallet) || window.ethereum;
        } else if (walletName === 'Brave Wallet') {
          ethereumProvider = window.ethereum.providers.find((p: any) => p.isBraveWallet) || window.ethereum;
        }
      }

      // 1. Connect and get the address with timeout
      const provider = new BrowserProvider(ethereumProvider);

      // Request accounts with a timeout to avoid indefinite hanging
      const accountsPromise = provider.send("eth_requestAccounts", []);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out. Please check if MetaMask is unlocked and try again.')), 60000)
      );

      const accounts = await Promise.race([accountsPromise, timeoutPromise]) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found. Please ensure your wallet is unlocked.');
      }

      const address = accounts[0];
      const network = await provider.getNetwork();

      // 2. Fetch the nonce from our backend
      const nonceData = await apiFetch<{ nonce: string }>("/api/auth/nonce", {
        method: "POST",
        body: JSON.stringify({ walletAddress: address }),
      });

      // 3. Construct the message to sign
      const message = buildSiweMessage({
        address,
        nonce: nonceData.nonce,
        chainId: Number(network.chainId),
      });

      // 4. Sign the message
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);

      // 5. Verify the signature on the backend
      const verifyData = await apiFetch<{
        token: string;
        agent: { id: string; walletAddress: string };
      }>("/api/auth/verify", {
        method: 'POST',
        body: JSON.stringify({
          message,
          signature,
          nonce: nonceData.nonce,
        }),
      });

      setSession({
        token: verifyData.token,
        agentId: verifyData.agent.id,
        walletAddress: verifyData.agent.walletAddress,
      });

      onConnect(walletName, verifyData.agent.walletAddress);
      onClose();
      setConnectingTo(null);

    } catch (error) {
      console.error('Wallet connection error:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Connection rejected or failed. Please try again.',
      );
      setConnectingTo(null);
    }
  };

  const providers = [
    { name: 'MetaMask', icon: <Wallet size={20} />, type: 'Browser Extension', color: 'hover:border-[#F6851B]' },
    { name: 'Brave Wallet', icon: <Shield size={20} />, type: 'Native Browser', color: 'hover:border-[#FB542B]' },
    { name: 'WalletConnect', icon: <Hexagon size={20} />, type: 'Mobile Link', color: 'hover:border-[#3B99FC]' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal Body */}
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative w-full max-w-md glass-panel p-1 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(98,126,234,0.15)]"
          >
            {/* Cyberpunk Circuit Background pattern */}
            <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)' }} />

            <div className="relative z-10 bg-[#050507]/90 rounded-xl p-6 sm:p-8 flex flex-col items-center border border-white/5">

              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-[#a3a3a3] hover:text-white transition-colors"
              >
                <X size={20} />
              </button>

              <div className="w-16 h-16 rounded-full bg-holographic mb-6 flex items-center justify-center text-white shadow-[0_0_20px_rgba(98,126,234,0.3)]">
                <Fingerprint size={32} />
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-[#ededed] mb-1">
                Establish Identity
              </h2>
              <p className="text-sm font-mono text-[#a3a3a3] mb-8 uppercase tracking-widest bg-white/5 px-3 py-1 rounded">
                Web3 RPC Connection
              </p>

              <div className="w-full space-y-3">
                {providers.map((provider) => (
                  <button
                    key={provider.name}
                    onClick={() => handleConnect(provider.name)}
                    disabled={connectingTo !== null}
                    className={`
                      w-full flex items-center justify-between p-4 rounded-xl border border-white/10 
                      bg-white/[0.02] transition-all duration-300 group
                      ${connectingTo === provider.name ? 'border-[#627EEA] bg-[#627EEA]/10' : provider.color}
                      ${connectingTo && connectingTo !== provider.name ? 'opacity-40 cursor-not-allowed' : ''}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`
                        p-2 rounded-lg bg-black/40 text-[#a3a3a3] group-hover:text-white transition-colors
                        ${connectingTo === provider.name ? 'text-[#627EEA]' : ''}
                      `}>
                        {provider.icon}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="font-bold text-[#ededed] group-hover:text-white">{provider.name}</span>
                        <span className="text-[10px] font-mono text-[#a3a3a3] uppercase">{provider.type}</span>
                      </div>
                    </div>

                    {connectingTo === provider.name ? (
                      <div className="px-3 py-1 rounded bg-[#627EEA]/20 border border-[#627EEA]/50">
                        <span className="text-[10px] font-mono text-[#627EEA] animate-pulse">CONNECTING...</span>
                      </div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/10 group-hover:bg-white/40 transition-colors" />
                    )}
                  </button>
                ))}
              </div>

              {errorMessage ? (
                <div className="mt-4 w-full rounded-lg border border-[#FF4F4F]/40 bg-[#FF4F4F]/10 p-3 text-xs font-mono text-[#FFB4B4]">
                  {errorMessage}
                </div>
              ) : null}

              <div className="mt-8 text-center text-xs text-[#a3a3a3] font-mono border-t border-white/10 pt-6 w-full">
                <p>BY CONNECTING, YOU AGREE TO THE PROTOCOL&apos;S</p>
                <p className="text-[#627EEA]">ZERO-KNOWLEDGE TERMS</p>
              </div>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
