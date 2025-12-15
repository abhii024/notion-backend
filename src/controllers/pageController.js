import { Page } from '../models/Page.js';
import { Block } from '../models/Block.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { BlockHistory } from '../models/BlockHistory.js';
export const pageController = {
  // Create a new page
  createPage: asyncHandler(async (req, res) => {
    const { title, content, icon, cover_image } = req.body;
    const parent_id = req.user?.id;
    console.log("parent_id",parent_id)
    const page = await Page.create({
      title: title || 'Untitled',
      content: content || {},
      parent_id: parent_id || null,
      icon: icon || '📄',
      cover_image: cover_image || null
    });
    
    res.status(201).json({
      success: true,
      data: page
    });
  }),

  // Get all pages
  getAllPages: asyncHandler(async (req, res) => {
    const { include_unpublished } = req.query;
    const parent_id = req.user?.id;
    let pages;
    console.log("parent_id",parent_id)
    console.log("parent_id",include_unpublished)
    if (parent_id) {
      pages = await Page.findChildren(parent_id);
    } else {
      pages = await Page.findAll();
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
    
    // Check if id is a slug (contains letters or hyphens)
    let page;
    if (isNaN(id)) {
      // It's a slug
      page = await Page.findBySlug(id);
    } else {
      // It's a numeric ID
      page = await Page.findById(id);
    }
    
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    let data = { page };
    
    if (historyId) {
      // Implement logic to fetch and include history based on historyId
      const pageData = await BlockHistory.getPageAtHistory(page.id, historyId);
      console.log("pageData", pageData?.blocks)
      data.blocks = pageData?.blocks || [];
    }
    else {
      const blocks = await Block.findByPageId(page.id);
      console.log("blocks", blocks)
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
    
    // Check if page exists
    const existingPage = await Page.findById(id, true);
    if (!existingPage) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
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
    
    const deleted = await Page.delete(id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    // Also delete associated blocks
    // await Block.deleteByPageId(id);
    
    res.json({
      success: true,
      message: 'Page deleted successfully'
    });
  }),

  // Search pages
  searchPages: asyncHandler(async (req, res) => {
    const { q } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }
    
    const pages = await Page.search(q);
    
    res.json({
      success: true,
      count: pages.length,
      data: pages
    });
  }),

  // Get page tree (hierarchy)
  getPageTree: asyncHandler(async (req, res) => {
    const buildTree = async (parentId = null) => {
      const pages = await Page.findChildren(parentId);
      
      const tree = await Promise.all(pages.map(async (page) => {
        const children = await buildTree(page.id);
        return {
          ...page,
          children: children.length > 0 ? children : undefined
        };
      }));
      
      return tree;
    };
    
    const tree = await buildTree();
    
    res.json({
      success: true,
      data: tree
    });
  }),

  // Get page by slug
  getPageBySlug: asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { include_blocks } = req.query;
    
    const page = await Page.findBySlug(slug);
    
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    let data = { page };
    
    if (include_blocks === 'true') {
      const blocks = await Block.findByPageId(page.id);
      data.blocks = blocks;
    }
    
    res.json({
      success: true,
      data
    });
  })
};