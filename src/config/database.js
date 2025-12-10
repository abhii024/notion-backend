import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'notion_app',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Test connection
export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    
    // Initialize database tables
    await initTables(connection);
    
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
};

// Initialize database tables with MySQL syntax
const initTables = async (connection) => {
  try {
    // Create pages table - using DEFAULT (UUID()) for MySQL
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
        slug VARCHAR(255) NOT NULL UNIQUE,
        content JSON,
        parent_id INT,
        icon VARCHAR(50) DEFAULT '📄',
        cover_image TEXT,
        is_published BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES pages(id) ON DELETE SET NULL
      )
    `);

    // Create blocks table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        page_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        properties JSON,
        format JSON,
        parent_id INT,
        order_index INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES blocks(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await connection.query(`CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug)`);
    await connection.query(`CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id)`);
    await connection.query(`CREATE INDEX IF NOT EXISTS idx_pages_created_at ON pages(created_at DESC)`);
    await connection.query(`CREATE INDEX IF NOT EXISTS idx_blocks_page_id ON blocks(page_id)`);
    await connection.query(`CREATE INDEX IF NOT EXISTS idx_blocks_parent_id ON blocks(parent_id)`);
    await connection.query(`CREATE INDEX IF NOT EXISTS idx_blocks_order ON blocks(page_id, order_index)`);
    
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Table initialization error:', error.message);
  }
};