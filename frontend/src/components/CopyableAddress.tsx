"use client";

import { useState } from "react";

interface CopyableAddressProps {
  address: string;
  short?: boolean;
  className?: string;
  displayName?: string; // Optional name to display instead of address
}

export default function CopyableAddress({ 
  address, 
  short = false, 
  className = "",
  displayName 
}: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // Always copy the address, not the display name
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // If displayName is provided, show it; otherwise show address
  const displayText = displayName || (short ? `${address.slice(0, 8)}...${address.slice(-8)}` : address);
  const isNameDisplayed = !!displayName;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={isNameDisplayed ? "text-sm font-medium" : "font-mono text-sm"}>
        {displayText}
      </span>
      {isNameDisplayed && (
        <span className="text-xs text-gray-400 font-mono">
          ({short ? `${address.slice(0, 4)}...${address.slice(-4)}` : address.slice(0, 8) + "..."})
        </span>
      )}
      <button
        onClick={handleCopy}
        className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
        title={`Copy address: ${address}`}
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}

