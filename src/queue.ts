// queue.ts
import { Queue, Worker, Job } from 'bullmq';
import bs58 from 'bs58';
import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PumpFunSDK, DEFAULT_DECIMALS } from 'pumpdotfun-sdk';
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Blob } from 'buffer';

const connection = {
  username: "default",
  password: 'ckx8xMIlLAxF4VthHvEw58MmxnsBmsdV',
    host: 'redis-13825.c1.us-east1-2.gce.redns.redis-cloud.com',
    port: 13825
  
};

const createTokenQueue = new Queue('create-token-queue', { connection });

interface CreateTokenJobData {
  createTokenMetadata: any;
  config: any;
  file: {
    buffer: Buffer;
    mimetype: string;
  };
}

const createTokenWorker = new Worker('create-token-queue', async (job: Job<CreateTokenJobData>) => {
  const { createTokenMetadata, config, file } = job.data;
  const creator = Keypair.fromSecretKey(bs58.decode(config.wallet));
  const SLIPPAGE_BASIS_POINTS = BigInt(100);
  const solanaConnection = new Connection(config.rpc);
  const wallet = new Wallet(creator);
  const provider = new AnchorProvider(solanaConnection, wallet, { commitment: "finalized" });
  const pumpFunSDK = new PumpFunSDK(provider);
  let mint: Keypair;

  if (config.mint === "random") {
    mint = Keypair.generate();
  } else if (config.mint.length === 87) {
    mint = Keypair.fromSecretKey(bs58.decode(config.mint));
  } else if (config.mint.includes('[')) {
    mint = Keypair.fromSecretKey(new Uint8Array(config.mint.slice(1, -1).split(',').map(Number)));
  } else {
    throw new Error("Invalid config.mint value");
  }

  createTokenMetadata.file = new Blob([Buffer.from(file.buffer)], { type: file.mimetype });

  let currentSolBalance = await solanaConnection.getBalance(creator.publicKey);
  if (currentSolBalance === 0) {
    throw new Error("Balance zero SOL");
  }

  let boundingCurveAccount = await pumpFunSDK.getBondingCurveAccount(mint.publicKey);
  if (!boundingCurveAccount) {
    let createResults = await pumpFunSDK.createAndBuy(
      creator,
      mint,
      createTokenMetadata,
      BigInt(config.buyAmount * LAMPORTS_PER_SOL),
      SLIPPAGE_BASIS_POINTS,
      {
        unitLimit: 250000,
        unitPrice: config.priorityFee,
      },
    );
    return createResults;
  } else {
    return { message: "Token already exists", publicKey: mint.publicKey.toString() };
  }
}, { connection });

createTokenWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});

export { createTokenQueue };
