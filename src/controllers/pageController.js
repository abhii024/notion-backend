import { Page } from '../models/Page.js';
import { Block } from '../models/Block.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { BlockHistory } from '../models/BlockHistory.js';
import { pool } from '../config/database.js';
export const pageController = {
  // Create a new page
  createPage: asyncHandler(async (req, res) => {
    const { title, content, icon, cover_image } = req.body;

    // Use authenticated user's ID
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const page = await Page.create({
      title: title || 'Untitled',
      content: content || {},
      user_id: userId,
      icon: icon || '📄',
      cover_image: cover_image || null
    });

    res.status(201).json({
      success: true,
      data: page
    });
  }),

  // Get all pages for the current user
  getAllPages: asyncHandler(async (req, res) => {
    const { include_unpublished } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get pages for this user only
    let pages;
    if (include_unpublished === 'true') {
      pages = await Page.findAll(userId);
    } else {
      // Filter by is_published
      // const [rows] = await pool.query(
      //   'SELECT * FROM pages WHERE user_id = ? AND is_published = TRUE ORDER BY created_at DESC',
      //   [userId]
      // );
      const [rows] = await pool.query(
        'SELECT * FROM pages WHERE is_published = TRUE ORDER BY created_at DESC'
      );
      pages = rows;
    }

    res.json({
      success: true,
      count: pages.length,
      data: pages
    });
  }),

  // Get single page by ID or slug
  getPage: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { include_blocks } = req.query;
    const { historyId } = req.query;
    const userId = req.user?.id;

    // if (!userId) {
    //   return res.status(401).json({
    //     success: false,
    //     error: 'Authentication required'
    //   });
    // }

    // Check if id is a slug (contains letters or hyphens)
    let page;
    if (isNaN(id)) {
      // It's a slug - find by slug for this user
      page = await Page.findBySlug(id, userId);
    } else {
      // It's a numeric ID - find by ID (check user ownership)
      page = await Page.findById(id);

      // Check if page belongs to user
      // if (page && page.user_id !== userId) {
      //   return res.status(403).json({
      //     success: false,
      //     error: 'Access denied'
      //   });
      // }
    }

    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    let data = { page };

    if (historyId) {
      // Fetch historical version
      const pageData = await BlockHistory.getPageAtHistory(page.id, historyId, userId);
      data.blocks = pageData?.blocks || [];
    } else if (include_blocks === 'true' || include_blocks === undefined) {
      // Fetch current blocks
      const blocks = await Block.findByPageId(page.id, userId);
      data.blocks = blocks;
    }

    res.json({
      success: true,
      data
    });
  }),

  // Update page
  updatePage: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if page exists and belongs to user
    const existingPage = await Page.findById(id);
    if (!existingPage) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    if (existingPage.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const updatedPage = await Page.update(id, updates);

    res.json({
      success: true,
      data: updatedPage
    });
  }),

  // Delete page
  deletePage: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const deleted = await Page.delete(id, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Page not found or access denied'
      });
    }

    res.json({
      success: true,
      message: 'Page deleted successfully'
    });
  }),

  // Search pages for current user
  searchPages: asyncHandler(async (req, res) => {
    const { q } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const pages = await Page.search(q, userId);

    res.json({
      success: true,
      count: pages.length,
      data: pages
    });
  }),

  // Get page tree (flat structure now since parent_id is removed)
  getPageTree: asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Since parent_id is removed, return flat list of pages
    const pages = await Page.findAll(userId);

    res.json({
      success: true,
      data: pages.map(page => ({
        ...page,
        children: [] // Empty children array for compatibility
      }))
    });
  }),

  // Get page by slug for current user
  getPageBySlug: asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { include_blocks } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const page = await Page.findBySlug(slug, userId);

    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    let data = { page };

    if (include_blocks === 'true') {
      const blocks = await Block.findByPageId(page.id, userId);
      data.blocks = blocks;
    }

    res.json({
      success: true,
      data
    });
  }),

  // Get pages by user (same as getAllPages but with explicit user_id)
  getPagesByUser: asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const pages = await Page.findByUser(userId);

    res.json({
      success: true,
      count: pages.length,
      data: pages
    });
  })
};