import { Page } from '../models/Page.js';
import { Block } from '../models/Block.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { BlockHistory } from '../models/BlockHistory.js';

export const pageController = {
  // Create a new page
  createPage: asyncHandler(async (req, res) => {
    const { title, content, icon, cover_image, is_published } = req.body;
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
      cover_image: cover_image || null,
      is_published: is_published !== undefined ? is_published : true
    });

    res.status(201).json({
      success: true,
      data: page
    });
  }),

  // Get all pages
  getAllPages: asyncHandler(async (req, res) => {
    const { include_unpublished } = req.query;
    const userId = req.user?.id;

    
    // if (userId && include_unpublished === 'true') {
    //   // User wants to see all their pages
    //   pages = await Page.findByUser(userId);
    // } else if (userId) {
    //   // User sees their published pages
    //   pages = await Page.findAll(userId);
    // } else {
      // Public - only published pages
      let pages = await Page.findAll();
    // }

    res.json({
      success: true,
      count: pages.length,
      data: pages
    });
  }),

  // Get single page by ID or slug
  getPage: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { include_blocks, historyId } = req.query;
    const userId = req.user?.id;

    let page;
    let pageId;
    
    // Determine if parameter is ID or slug
    if (isNaN(id)) {
      // It's a slug
      page = await Page.findBySlug(id, userId);
      pageId = page ? page.id : null;
    } else {
      // It's a numeric ID
      page = await Page.findById(id, userId);
      pageId = id;
    }

    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    let data = { page };

    // Get blocks if requested
    if (historyId) {
      const pageData = await BlockHistory.getPageAtHistory(pageId, historyId, userId);
      data.blocks = pageData?.blocks || [];
    } else if (include_blocks === 'true' || include_blocks === undefined) {
      const blocks = await Block.findByPageId(pageId);
      data.blocks = blocks;
    }

    res.json({
      success: true,
      data
    });
  }),

  // Get page by slug only
  getPageBySlug: asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { include_blocks, historyId } = req.query;
    const userId = req.user?.id;

    const page = await Page.findBySlug(slug, userId);
    
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    let data = { page };
    console.log("include_blocks",include_blocks);
    console.log("historyId",historyId);
    if (historyId) {
      const pageData = await BlockHistory.getPageAtHistory(page.id, historyId, userId);
      console.log("pageData",pageData)
      data.blocks = pageData?.blocks || [];
    } else if (include_blocks === 'true' || include_blocks === undefined) {
      const blocks = await Block.findByPageId(page.id);
      data.blocks = blocks;
    }

    res.json({
      success: true,
      data
    });
  }),

  // Get page ID from slug
  getPageIdFromSlug: asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const userId = req.user?.id;

    const pageId = await Page.getIdFromSlug(slug, userId);
    
    if (!pageId) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    res.json({
      success: true,
      data: { id: pageId }
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

    const existingPage = await Page.findById(id, userId);
    if (!existingPage) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    const updatedPage = await Page.update(id, updates, userId);

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

  // Search pages
  searchPages: asyncHandler(async (req, res) => {
    const { q } = req.query;
    const userId = req.user?.id;

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

  // Get page tree
  getPageTree: asyncHandler(async (req, res) => {
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
      data: pages.map(page => ({
        ...page,
        children: []
      }))
    });
  }),

  // Get pages by user
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