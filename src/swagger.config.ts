import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import path from 'path';
import fs from 'fs';

/**
 * Swagger Configuration Options
 */
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Meme Token & AMM API',
      version: '1.0.0',
      description: 'API for managing meme tokens and automated market maker (AMM) pools on Solana blockchain',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'https://api.yourproduction.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Meme Token',
        description: 'Operations related to meme token management',
      },
      {
        name: 'AMM Pool',
        description: 'Operations related to automated market maker pools',
      },
    ],
  },
  // Path to the API routes files
  apis: [
    './src/routes/*.ts',
    './src/controllers/*.ts',
    './src/swagger.json', // Include the swagger.json file
  ],
};

/**
 * Initialize Swagger documentation
 * @param app - Express application instance
 */
export const setupSwagger = (app: Express): void => {
  // Try to load swagger.json if it exists
  const swaggerJsonPath = path.join(__dirname, 'swagger.json');
  let swaggerSpec;

  if (fs.existsSync(swaggerJsonPath)) {
    // Load from swagger.json file
    const swaggerDocument = JSON.parse(fs.readFileSync(swaggerJsonPath, 'utf8'));
    swaggerSpec = swaggerDocument;
    console.log('✅ Loaded Swagger documentation from swagger.json');
  } else {
    // Generate from JSDoc comments
    swaggerSpec = swaggerJsdoc(swaggerOptions);
    console.log('✅ Generated Swagger documentation from JSDoc comments');
  }

  // Swagger UI options
  const swaggerUiOptions = {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Meme Token & AMM API Documentation',
  };

  // Serve Swagger UI at /api-docs
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(swaggerSpec, swaggerUiOptions));

  // Serve raw Swagger JSON at /api-docs/swagger.json
  app.get('/api-docs/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('📚 Swagger documentation available at: http://localhost:5000/api-docs');
};

/**
 * Alternative: Setup Swagger using only the swagger.json file
 * Use this if you prefer to maintain documentation entirely in swagger.json
 */
export const setupSwaggerFromJson = (app: Express): void => {
  const swaggerJsonPath = path.join(__dirname, 'swagger.json');
  
  if (!fs.existsSync(swaggerJsonPath)) {
    console.error('❌ swagger.json file not found at:', swaggerJsonPath);
    return;
  }

  const swaggerDocument = JSON.parse(fs.readFileSync(swaggerJsonPath, 'utf8'));

  const swaggerUiOptions = {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Meme Token & AMM API Documentation',
  };

  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(swaggerDocument, swaggerUiOptions));

  app.get('/api-docs/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });

  console.log('📚 Swagger documentation available at: http://localhost:5000/api-docs');
  console.log('📄 Raw Swagger JSON available at: http://localhost:5000/api-docs/swagger.json');
};

export default setupSwagger;