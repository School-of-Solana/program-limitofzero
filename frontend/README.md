# AMM Frontend

A modern Next.js frontend for the AMM (Automated Market Maker) DEX.

## Features

- **Create AMM**: Create a new AMM with custom fee and index
- **Create Pool**: Create liquidity pools for token pairs
- **Add Liquidity**: Provide liquidity to existing pools
- **Swap**: Trade tokens through the AMM
- **View Pools**: Browse all created pools with their reserves and fees

## Getting Started

### Prerequisites

- Node.js 18+ 
- Yarn or npm

### Installation

```bash
# Install dependencies
yarn install
# or
npm install
```

### Development

```bash
# Run development server
yarn dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
# Build for production
yarn build
# or
npm run build
```

## Configuration

The program ID is configured in `src/lib/program.ts`. Make sure the IDL file (`public/amm.json`) matches your deployed program.

## Wallet Support

The frontend supports:
- Phantom Wallet
- Solflare Wallet

Connect your wallet to interact with the AMM.
