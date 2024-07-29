import express, { Request, Response } from 'express';
import cors from "cors";
import bodyParser from 'body-parser';
import bs58 from 'bs58';
import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { PumpFunSDK, DEFAULT_DECIMALS } from 'pumpdotfun-sdk';
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import fs from "fs";
import multer from 'multer';
import path from 'path';
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
        const creator = Keypair.fromSecretKey(bs58.decode(config.wallet));
        const SLIPPAGE_BASIS_POINTS = BigInt(100);
        const connection = new Connection(config.rpc);
        const wallet = new Wallet(creator);
        const provider = new AnchorProvider(connection, wallet, { commitment: "finalized" });
        const pumpFunSDK = new PumpFunSDK(provider);
        let mint: Keypair | Uint8Array;
        if (config.mint === "random") {
            mint = Keypair.generate();
        } else if (config.mint.length === 87) {
            mint = Keypair.fromSecretKey(bs58.decode(config.mint));
        } else {
            mint = Keypair.fromSecretKey(new Uint8Array(config.mint.slice(1, -1).split(',').map(Number)));
        }
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
                    unitPrice: config.priorityFee,
                },
            );
            res.json(createResults);
        } else {
            res.json({ message: "Token already exists", publicKey: mint.publicKey.toString() });
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
        res.json({"privateKey": `[${mint.secretKey.toString()}]` });
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

const PORT = process.env.PORT || 80;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
