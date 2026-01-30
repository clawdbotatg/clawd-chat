"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address } from "@scaffold-ui/components";
import { useScaffoldReadContract, useScaffoldWriteContract, useScaffoldEventHistory, useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { formatUnits } from "viem";
import type { NextPage } from "next";
import { notification } from "~~/utils/scaffold-eth";

const CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07" as const;

const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const Home: NextPage = () => {
  const { address: connectedAddress, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const [message, setMessage] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [clawdPrice, setClawdPrice] = useState<number>(0);
  const [clawdBalance, setClawdBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get deployed ClawdChat contract info (for address)
  const { data: chatContractInfo } = useDeployedContractInfo("ClawdChat");
  const chatContractAddress = chatContractInfo?.address;

  // Read contract data via scaffold hooks
  const { data: messageCost } = useScaffoldReadContract({
    contractName: "ClawdChat",
    functionName: "messageCost",
  });

  const { data: totalMessages } = useScaffoldReadContract({
    contractName: "ClawdChat",
    functionName: "totalMessages",
  });

  const { data: totalBurned } = useScaffoldReadContract({
    contractName: "ClawdChat",
    functionName: "totalBurned",
  });

  // ERC20 approve via wagmi writeContract
  const { writeContract: writeApprove, data: approveTxHash } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Scaffold write for posting
  const { writeContractAsync: writeChat } = useScaffoldWriteContract("ClawdChat");

  // Fetch balance and allowance
  const fetchBalanceAndAllowance = useCallback(async () => {
    if (!connectedAddress || !publicClient || !chatContractAddress) return;
    try {
      const [bal, allow] = await Promise.all([
        publicClient.readContract({
          address: CLAWD_TOKEN,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [connectedAddress],
        }),
        publicClient.readContract({
          address: CLAWD_TOKEN,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [connectedAddress, chatContractAddress],
        }),
      ]);
      setClawdBalance(bal);
      setAllowance(allow);
    } catch (e) {
      console.error("Error fetching balance/allowance:", e);
    }
  }, [connectedAddress, publicClient, chatContractAddress]);

  useEffect(() => {
    fetchBalanceAndAllowance();
    const interval = setInterval(fetchBalanceAndAllowance, 5000);
    return () => clearInterval(interval);
  }, [fetchBalanceAndAllowance]);

  // Refresh after approve confirms
  useEffect(() => {
    if (approveConfirmed) {
      fetchBalanceAndAllowance();
      setIsApproving(false);
      notification.success("Approved! You can now post.");
    }
  }, [approveConfirmed, fetchBalanceAndAllowance]);

  // Fetch CLAWD price from DexScreener
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CLAWD_TOKEN}`);
        const data = await res.json();
        if (data.pairs && data.pairs.length > 0) {
          setClawdPrice(parseFloat(data.pairs[0].priceUsd || "0"));
        }
      } catch (e) {
        console.error("Error fetching price:", e);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Event history for messages
  const { data: events, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "ClawdChat",
    eventName: "MessagePosted",
    fromBlock: 0n,
    watch: true,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // Derived state
  const wrongNetwork = connectedAddress ? chain?.id !== targetNetwork.id : false;
  const needsApproval = messageCost ? allowance < messageCost : true;
  const hasEnoughBalance = messageCost ? clawdBalance >= messageCost : false;

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    try {
      switchChain({ chainId: targetNetwork.id });
    } catch (e) {
      console.error(e);
      notification.error("Failed to switch network");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleApprove = async () => {
    if (!messageCost || !chatContractAddress) return;
    setIsApproving(true);
    try {
      // Approve EXACT amount for 1 message — no unlimited approvals
      writeApprove({
        address: CLAWD_TOKEN,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [chatContractAddress, messageCost],
      });
    } catch (e) {
      console.error(e);
      notification.error("Approval failed");
      setIsApproving(false);
    }
  };

  const handlePost = async () => {
    if (!message.trim()) return;
    setIsPosting(true);
    try {
      await writeChat({
        functionName: "postMessage",
        args: [message],
      });
      setMessage("");
      notification.success("Message posted! 🔥");
      setTimeout(fetchBalanceAndAllowance, 3000);
    } catch (e) {
      console.error(e);
      notification.error("Failed to post message");
    } finally {
      setIsPosting(false);
    }
  };

  const formatClawd = (amount: bigint | undefined) => {
    if (!amount) return "0";
    return parseFloat(formatUnits(amount, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const formatClawdUsd = (amount: bigint | undefined) => {
    if (!amount || !clawdPrice) return "";
    const value = parseFloat(formatUnits(amount, 18)) * clawdPrice;
    if (value < 0.01) return "<$0.01";
    return `~$${value.toFixed(2)}`;
  };

  // Sort events oldest first for chat display
  const sortedEvents = events ? [...events].reverse() : [];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Stats Bar */}
      <div className="bg-base-200 border-b border-base-300 px-4 py-2 flex items-center justify-between text-sm flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-semibold text-primary">🔥 Burn to Chat</span>
          <span className="opacity-70">
            {totalMessages?.toString() || "0"} messages
          </span>
          <span className="opacity-70">
            {formatClawd(totalBurned)} CLAWD burned
            {formatClawdUsd(totalBurned) && <span className="text-xs ml-1">({formatClawdUsd(totalBurned)})</span>}
          </span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="badge badge-ghost badge-sm">
            {formatClawd(messageCost)} CLAWD/msg
            {formatClawdUsd(messageCost) && <span className="ml-1">({formatClawdUsd(messageCost)})</span>}
          </span>
          {connectedAddress && (
            <span className="badge badge-outline badge-sm">
              Bal: {formatClawd(clawdBalance)}
              {clawdPrice > 0 && <span className="ml-1">({formatClawdUsd(clawdBalance)})</span>}
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-2 md:px-4 py-4 space-y-3">
        {eventsLoading && (
          <div className="flex justify-center items-center h-full">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        )}

        {!eventsLoading && sortedEvents.length === 0 && (
          <div className="flex justify-center items-center h-full text-base-content/50">
            <div className="text-center">
              <p className="text-5xl mb-4">🔥</p>
              <p className="text-lg font-semibold">No messages yet</p>
              <p className="text-sm mt-1">Be the first to burn $CLAWD and post!</p>
            </div>
          </div>
        )}

        {sortedEvents.map((event, i) => {
          const sender = event.args?.sender;
          const msg = event.args?.message;
          const burnAmount = event.args?.burnAmount;
          const timestamp = event.args?.timestamp;
          const isMe = sender?.toLowerCase() === connectedAddress?.toLowerCase();

          return (
            <div
              key={`${event.log.blockNumber}-${event.log.logIndex}-${i}`}
              className={`chat ${isMe ? "chat-end" : "chat-start"}`}
            >
              <div className="chat-header flex items-center gap-2 mb-1">
                <Address address={sender} chain={targetNetwork} />
                <time className="text-xs opacity-50">
                  {timestamp
                    ? new Date(Number(timestamp) * 1000).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </time>
              </div>
              <div className={`chat-bubble ${isMe ? "chat-bubble-primary" : ""}`}>
                {msg}
              </div>
              <div className="chat-footer opacity-50 text-xs mt-0.5">
                🔥 {formatClawd(burnAmount)} CLAWD burned
                {clawdPrice > 0 && burnAmount && ` (${formatClawdUsd(burnAmount)})`}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-base-300 bg-base-100 px-2 md:px-4 py-3">
        {!connectedAddress ? (
          <div className="text-center py-4 text-base-content/60">
            <p className="text-lg">Connect your wallet to post messages</p>
            <p className="text-sm mt-1">Anyone can read — burn $CLAWD to write</p>
          </div>
        ) : wrongNetwork ? (
          <div className="flex justify-center">
            <button
              className="btn btn-warning"
              disabled={isSwitching}
              onClick={handleSwitchNetwork}
            >
              {isSwitching ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Switching...
                </>
              ) : (
                "Switch to Base"
              )}
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-base-content/50">
                  {message.length}/280 • Cost: {formatClawd(messageCost)} CLAWD
                  {formatClawdUsd(messageCost) && ` (${formatClawdUsd(messageCost)})`}
                </span>
                {needsApproval && hasEnoughBalance && (
                  <span className="text-xs text-warning">Approval needed first</span>
                )}
              </div>
              <textarea
                className="textarea textarea-bordered w-full resize-none"
                placeholder="Type a message... (burn CLAWD to post)"
                rows={2}
                maxLength={280}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!needsApproval && hasEnoughBalance && message.trim() && !isPosting) {
                      handlePost();
                    }
                  }
                }}
                disabled={isPosting}
              />
            </div>
            <div className="flex flex-col gap-1">
              {needsApproval ? (
                <button
                  className="btn btn-secondary btn-sm md:btn-md whitespace-nowrap"
                  disabled={isApproving || !hasEnoughBalance}
                  onClick={handleApprove}
                >
                  {isApproving ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      Approving...
                    </>
                  ) : !hasEnoughBalance ? (
                    "Need CLAWD"
                  ) : (
                    "Approve"
                  )}
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-sm md:btn-md whitespace-nowrap"
                  disabled={isPosting || !message.trim() || !hasEnoughBalance}
                  onClick={handlePost}
                >
                  {isPosting ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      Posting...
                    </>
                  ) : (
                    "🔥 Send"
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
