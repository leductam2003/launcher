// server.ts
import express, { Request, Response } from 'express';
import cors from "cors";
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import { createTokenQueue } from './queue'; 

const app = express();
app.use(bodyParser.json());
app.use(cors<Request>());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/create', upload.single('createTokenMetadata[file]'), async (req: Request, res: Response) => {
  let createTokenMetadata = req.body.createTokenMetadata;
  const config = req.body.config;

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const job = await createTokenQueue.add('create-token-job', {
      createTokenMetadata,
      config,
      file: {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype
      }
    });
    res.json({ status: true, jobId: job.id });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Unknown error occurred" });
    }
  }
});

app.listen(80, () => {
  console.log(`Server is running`);
});
