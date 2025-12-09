import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Import routes
import pageRoutes from './routes/pageRoutes.js';
import blockRoutes from './routes/blockRoutes.js';

// Import middleware
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { upload, handleUploadError, getFileUrl } from './middleware/upload.js';

// Import database
import { testConnection } from './config/database.js';

// Initialize environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ CORS FIRST - सबसे महत्वपूर्ण
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition']
}));

// ✅ Handle OPTIONS requests for CORS preflight
app.options('*', cors());

// ✅ Configure Helmet with proper CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      // ✅ Allow images from both origins
      imgSrc: ["'self'", "data:", "blob:", "http://localhost:5000", "http://localhost:3000"],
      connectSrc: ["'self'", "http://localhost:5000", "ws://localhost:5000"],
      mediaSrc: ["'self'", "http://localhost:5000"],
      frameSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: false
}));

app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ✅ Custom middleware for uploads directory
app.use('/uploads', (req, res, next) => {
  // Set CORS headers specifically for static files
  const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Cache-Control');
  
  // Cache control for better performance
  if (req.path.match(/\.(jpg|jpeg|png|gif|webp|ico)$/)) {
    res.header('Cache-Control', 'public, max-age=31536000, immutable');
  }
  
  next();
});

// ✅ Serve static files from uploads directory
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, path) => {
    // Set proper MIME types
    if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (path.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    }
  }
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    uploadsPath: uploadsPath,
    staticFiles: {
      images: fs.existsSync(path.join(uploadsPath, 'images')),
      files: fs.existsSync(path.join(uploadsPath, 'files'))
    }
  });
});

// Debug routes
app.get('/api/debug/uploads', (req, res) => {
  try {
    const imagesDir = path.join(uploadsPath, 'images');
    const filesDir = path.join(uploadsPath, 'files');
    
    const imageFiles = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];
    const fileFiles = fs.existsSync(filesDir) ? fs.readdirSync(filesDir) : [];
    
    res.json({
      success: true,
      data: {
        uploadsPath,
        imagesDir,
        filesDir,
        imageFiles: imageFiles.map(file => ({
          name: file,
          url: `http://localhost:${PORT}/uploads/images/${file}`,
          path: path.join(imagesDir, file),
          exists: fs.existsSync(path.join(imagesDir, file))
        })),
        fileCounts: {
          images: imageFiles.length,
          files: fileFiles.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const isImage = req.file.mimetype.startsWith('image/');
    const fileType = isImage ? 'image' : 'file';
    const fileUrl = getFileUrl(req.file.filename, fileType);

    res.json({
      success: true,
      data: {
        url: fileUrl,
        absoluteUrl: `http://localhost:${PORT}${fileUrl}`,
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        type: fileType
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file'
    });
  }
});

// Handle upload errors
app.use(handleUploadError);

// API Routes
app.use('/api/pages', pageRoutes);
app.use('/api/blocks', blockRoutes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Check uploads directory
    if (!fs.existsSync(uploadsPath)) {
      console.log('📁 Creating uploads directory...');
      fs.mkdirSync(uploadsPath, { recursive: true });
      fs.mkdirSync(path.join(uploadsPath, 'images'), { recursive: true });
      fs.mkdirSync(path.join(uploadsPath, 'files'), { recursive: true });
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📁 Uploads directory: ${uploadsPath}`);
      console.log(`🌐 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔍 Debug uploads: http://localhost:${PORT}/api/debug/uploads`);
      console.log(`📚 API Documentation:`);
      console.log(`   GET    http://localhost:${PORT}/api/pages`);
      console.log(`   POST   http://localhost:${PORT}/api/pages`);
      console.log(`   GET    http://localhost:${PORT}/api/pages/:id`);
      console.log(`   PUT    http://localhost:${PORT}/api/pages/:id`);
      console.log(`   DELETE http://localhost:${PORT}/api/pages/:id`);
      console.log(`   POST   http://localhost:${PORT}/api/upload`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();