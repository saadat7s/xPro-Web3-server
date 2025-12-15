import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";

import mintMemeTxRouter from "./routes/mintMemeRoute";
import poolCreationTxRouter from "./routes/poolCreationRoute";
import { setupSwaggerFromJson } from "./swagger.config";
import helmet from "helmet";
import morgan from "morgan";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Setup Swagger Documentation
setupSwaggerFromJson(app);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/meme', mintMemeTxRouter);
app.use('/amm', poolCreationTxRouter);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    documentation: `${req.protocol}://${req.get('host')}/api-docs`,
  });
});

// Error Handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
});

// Start Server (only in non-serverless environments)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log('========================================');
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log('========================================');
  });
}

export default app;
  