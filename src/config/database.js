import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'notion_app',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    
    // Initialize database tables
    await initTables(client);
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
};

// Initialize database tables
const initTables = async (client) => {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
        content JSONB DEFAULT '{}',
        parent_id UUID REFERENCES pages(id) ON DELETE CASCADE,
        icon VARCHAR(50) DEFAULT '📄',
        cover_image TEXT,
        is_published BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS blocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        properties JSONB DEFAULT '{}',
        format JSONB DEFAULT '{}',
        parent_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);
      CREATE INDEX IF NOT EXISTS idx_pages_created_at ON pages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_blocks_page_id ON blocks(page_id);
      CREATE INDEX IF NOT EXISTS idx_blocks_parent_id ON blocks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_blocks_order ON blocks(page_id, order_index);
    `);
    
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Table initialization error:', error.message);
  }
};