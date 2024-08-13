import express, { Request, Response } from 'express';
import cors from "cors";
import bodyParser from 'body-parser';
import bs58 from 'bs58';
import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey, ComputeBudgetProgram } from '@solana/web3.js';
import { PumpFunSDK, DEFAULT_DECIMALS } from 'pumpdotfun-sdk';
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import multer from 'multer';
import path from 'path';
import { getSPLBalance, privateToKeypair } from './utils';
import {
    ConnectionManager,
    TransactionBuilder,
    TransactionWrapper,
    Logger,
    sendTxUsingJito
} from "@solworks/soltoolkit-sdk";
const app = express();
app.use(bodyParser.json());
app.use(cors<Request>());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/create', upload.single('createTokenMetadata[file]'), async (req: Request, res: Response) => {
    try {
        let createTokenMetadata = req.body.createTokenMetadata;
        const config = req.body.config;
        const SLIPPAGE_BASIS_POINTS = BigInt(500);
        const connection = new Connection(config.rpc);
        const creator: Keypair = privateToKeypair(config.wallet);
        const wallet = new Wallet(creator);
        const provider = new AnchorProvider(connection, wallet, { commitment: "finalized" });
        const pumpFunSDK = new PumpFunSDK(provider);
        let mint: Keypair = privateToKeypair(config.mint);
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        createTokenMetadata.file = new Blob([req.file.buffer], { type: req.file.mimetype });
        let currentSolBalance = await connection.getBalance(creator.publicKey);
        if (currentSolBalance === 0) {
            return res.status(400).json({ error: "Balance zero SOL", publicKey: creator.publicKey.toBase58() });
        }

        console.log(`TOKEN: ${mint.publicKey.toString()}`);
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
                    unitPrice: config.priorityFee * LAMPORTS_PER_SOL,
                },
                config.tip * LAMPORTS_PER_SOL
            );
            res.json({result: createResults.signature});
        } else {
            res.status(500).json({ error: "Token already exists" });
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Unknown error occurred" });
        }
    }
});
app.post('/createAndSnipe', upload.single('createTokenMetadata[file]'), async (req: Request, res: Response) => {
    try {
        let createTokenMetadata = req.body.createTokenMetadata;
        const config = req.body.config;
        const SLIPPAGE_BASIS_POINTS = BigInt(500);
        const connection = new Connection(config.rpc);
        const creator: Keypair = privateToKeypair(config.wallet);
        const wallet = new Wallet(creator);
        const provider = new AnchorProvider(connection, wallet, { commitment: "finalized" });
        const pumpFunSDK = new PumpFunSDK(provider);
        let mint: Keypair = privateToKeypair(config.mint);
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        createTokenMetadata.file = new Blob([req.file.buffer], { type: req.file.mimetype });
        let currentSolBalance = await connection.getBalance(creator.publicKey);
        if (currentSolBalance === 0) {
            return res.status(400).json({ error: "Balance zero SOL", publicKey: creator.publicKey.toBase58() });
        }

        console.log(`TOKEN: ${mint.publicKey.toString()}`);
        let boundingCurveAccount = await pumpFunSDK.getBondingCurveAccount(mint.publicKey);
        const amounts = config.snipeAmounts.split(',').map((a: string) => BigInt(parseFloat(a) * LAMPORTS_PER_SOL));
        const keyPairMap = config.snipePrivateKeys.split(',').map((p: string) => privateToKeypair(p))
        if (!boundingCurveAccount) {
            let createResults = await pumpFunSDK.createAndBuyAndSnipe(
                creator,
                mint,
                createTokenMetadata,
                BigInt(config.buyAmount * LAMPORTS_PER_SOL),
                keyPairMap,
                amounts,
                SLIPPAGE_BASIS_POINTS,
                {
                    unitLimit: 250000,
                    unitPrice: config.priorityFee * LAMPORTS_PER_SOL,
                },
                config.tip * LAMPORTS_PER_SOL
            );
            res.json({result: createResults});
        } else {
            res.status(500).json({ error: "Token already exists" });
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Unknown error occurred" });
        }
    }
});
app.post('/snipe', async (req: Request, res: Response) => {
    try {
        const config = req.body;
        const creator = Keypair.fromSecretKey(bs58.decode(config.devWallet));
        const SLIPPAGE_BASIS_POINTS = BigInt(500);
        const connection = new Connection(config.rpc);
        const wallet = new Wallet(creator);
        const provider = new AnchorProvider(connection, wallet, { commitment: "finalized" });
        const pumpFunSDK = new PumpFunSDK(provider);
        const amounts = config.snipeAmounts.split(',').map((a: string) => BigInt(parseFloat(a) * LAMPORTS_PER_SOL));
        const keyPairMap = config.snipePrivateKeys.split(',').map((p: string) => privateToKeypair(p))
        const snipe = await pumpFunSDK.bundleBuy(
            keyPairMap,
            new PublicKey(config.mintAddress),
            amounts,
            SLIPPAGE_BASIS_POINTS,
            {
                unitLimit: 250000,
                unitPrice: config.priorityFee * LAMPORTS_PER_SOL,
            },
            config.tip * LAMPORTS_PER_SOL
        )
        res.json({bundleID: snipe});
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Unknown error occurred" });
        }
    }
});
app.post('/sell', async (req: Request, res: Response) => {
    try {
        const config = req.body;
        const creator = Keypair.fromSecretKey(bs58.decode(config.devWallet));
        const connection = new Connection(config.rpc);
        const wallet = new Wallet(creator);
        const provider = new AnchorProvider(connection, wallet, { commitment: "finalized" });
        const pumpFunSDK = new PumpFunSDK(provider);
        let currentSPLBalance = await getSPLBalance(
            connection,
            new PublicKey(config.mintAddress),
            creator.publicKey
        );
        console.log("currentSPLBalance", currentSPLBalance);
        if (currentSPLBalance) {
            const sellBalance = BigInt((Math.round(currentSPLBalance) - 1) * Math.pow(10, DEFAULT_DECIMALS));
            let sellResult = await pumpFunSDK.sell(
                creator,
                new PublicKey(config.mintAddress),
                sellBalance,
                {
                    unitLimit: 100000,
                    unitPrice: config.priorityFee * LAMPORTS_PER_SOL,
                },
                config.tip * LAMPORTS_PER_SOL
            );
            console.log(sellResult)
            res.json(sellResult);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Unknown error occurred" });
        }
    }
});

app.get('/generate', async (req: Request, res: Response) => {
    try {
        let mint: Keypair | Uint8Array;
        mint = Keypair.generate();
        res.json({ "privateKey": `[${mint.secretKey.toString()}]`, "privateKeyString": bs58.encode(mint.secretKey), "address": mint.publicKey.toString() });
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Unknown error occurred" });
        }
    }
});


app.post('/get_mint_address', async (req: Request, res: Response) => {
    try {
        const config = req.body;
        let mint: Keypair | Uint8Array;
        if (config.mint === "random") {
            mint = Keypair.generate();
        } else if (config.mint.length === 87) {
            mint = Keypair.fromSecretKey(bs58.decode(config.mint));
        } else {
            mint = Keypair.fromSecretKey(new Uint8Array(config.mint.slice(1, -1).split(',').map(Number)));
        }
        res.json({ "address": mint.publicKey.toString() });
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Unknown error occurred" });
        }
    }
});

app.post('/transfer', async (req: Request, res: Response) => {
    try {
        const config = req.body;
        const sender = Keypair.fromSecretKey(bs58.decode(config.wallet));
        const cm = await ConnectionManager.getInstance({
            commitment: 'processed',
            endpoints: [
                config.rpc,
            ],
            mode: "fastest",
            network: "mainnet-beta",
        });
        let fee_instr = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: config.fee * LAMPORTS_PER_SOL })
        ]
        var builder = TransactionBuilder
            .create()
            .addIx(
                fee_instr
            )
            .addSolTransferIx({
                from: sender.publicKey,
                to: new PublicKey(config.toAddress),
                amountLamports: config.amount * LAMPORTS_PER_SOL,
            });
        let tx = builder.build();
        const wrapper = await TransactionWrapper.create({
            connectionManager: cm,
            transaction: tx,
            signer: sender.publicKey,
        }).addBlockhashAndFeePayer(sender.publicKey);
        const signedTx = await wrapper.sign({
            signers: [sender],
        });
        const transferSig = await sendTxUsingJito({
            serializedTx: signedTx[0].serialize(),
            region: 'ny',
        });
        res.status(200).json({ "signature": transferSig });
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Unknown error occurred" });
        }
    }
});
app.post('/collect', async (req: Request, res: Response) => {
    try {
        const config = req.body;
        const fromWallet = Keypair.fromSecretKey(bs58.decode(config.fromWallet));
        const toWallet = Keypair.fromSecretKey(bs58.decode(config.toWallet));
        const cm = await ConnectionManager.getInstance({
            commitment: 'processed',
            endpoints: [
                config.rpc,
            ],
            mode: "fastest",
            network: "mainnet-beta",
        });
        let conn = cm.connSync({ changeConn: true });
        let fee = config.fee * LAMPORTS_PER_SOL;
        const balance = await conn.getBalance(fromWallet.publicKey, "confirmed");
        let amountSend = balance - fee - (0.001 * LAMPORTS_PER_SOL)
        let fee_instr = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: config.fee * LAMPORTS_PER_SOL })
        ]
        var builder = TransactionBuilder
            .create()
            .addIx(
                fee_instr
            )
            .addSolTransferIx({
                from: fromWallet.publicKey,
                to: toWallet.publicKey,
                amountLamports: amountSend,
            })
        let tx = builder.build();
        const wrapper = await TransactionWrapper.create({
            connectionManager: cm,
            transaction: tx,
            signer: fromWallet.publicKey,
        }).addBlockhashAndFeePayer(fromWallet.publicKey);


        const signedTx = await wrapper.sign({
            signers: [fromWallet],
        });
        const transferSig = await sendTxUsingJito({
            serializedTx: signedTx[0].serialize(),
            region: 'ny',
        });
        res.status(200).json({ "signature": transferSig });
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message)
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: "Unknown error occurred" });
        }
    }
});

const PORT = process.env.PORT || 80;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
