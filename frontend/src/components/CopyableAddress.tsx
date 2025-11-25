"use client";

import { useState } from "react";

interface CopyableAddressProps {
  address: string;
  short?: boolean;
  className?: string;
}

export default function CopyableAddress({ address, short = false, className = "" }: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const displayAddress = short ? `${address.slice(0, 8)}...${address.slice(-8)}` : address;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-mono text-sm">{displayAddress}</span>
      <button
        onClick={handleCopy}
        className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
        title="Copy address"
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}

