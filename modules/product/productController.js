const { db } = require('../../core/db/storage');
const { success, error } = require('../../core/utils/response');

class ProductController {
  createProduct(req, res) {
    try {
      const { shopId, name, description = '', category = 'General', price, stock = 0, imageUrl = '' } = req.body;

      if (!shopId || !name || price === undefined) {
        return error(res, 'shopId, name, and price are required fields', 400);
      }

      const shop = db.findById('shops', shopId);
      if (!shop) {
        return error(res, 'Target shop does not exist', 404);
      }

      if (shop.ownerId !== req.user.id && req.user.role !== 'admin') {
        return error(res, 'Forbidden: You do not own this shop', 403);
      }

      const parsedPrice = parseFloat(price);
      const parsedStock = parseInt(stock, 10);

      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return error(res, 'Price must be a valid non-negative number', 400);
      }

      if (isNaN(parsedStock) || parsedStock < 0) {
        return error(res, 'Stock must be a valid non-negative integer', 400);
      }

      const product = db.insert('products', {
        shopId: shop.id,
        shopName: shop.name,
        name: name.trim(),
        description: description.trim(),
        category: category.trim(),
        price: Math.round(parsedPrice * 100) / 100,
        stock: parsedStock,
        imageUrl: imageUrl.trim(),
        status: 'active'
      });

      return success(res, product, 'Product created successfully', 201);
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  listProducts(req, res) {
    try {
      const { shopId, category, search, minPrice, maxPrice, status = 'active' } = req.query;

      let products = db.find('products', doc => {
        if (status && doc.status !== status) return false;
        if (shopId && doc.shopId !== shopId) return false;
        if (category && doc.category.toLowerCase() !== category.toLowerCase()) return false;
        if (search) {
          const s = search.toLowerCase();
          const match = doc.name.toLowerCase().includes(s) || (doc.description && doc.description.toLowerCase().includes(s));
          if (!match) return false;
        }
        if (minPrice !== undefined && doc.price < parseFloat(minPrice)) return false;
        if (maxPrice !== undefined && doc.price > parseFloat(maxPrice)) return false;
        return true;
      });

      // 提取分类列表供前端筛选
      const allCategories = Array.from(new Set(db.find('products').map(p => p.category)));

      return success(res, {
        total: products.length,
        categories: allCategories,
        items: products
      }, 'Products retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  getProductById(req, res) {
    try {
      const product = db.findById('products', req.params.id);
      if (!product) {
        return error(res, 'Product not found', 404);
      }

      const shop = db.findById('shops', product.shopId);
      return success(res, { ...product, shop }, 'Product details retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  updateProduct(req, res) {
    try {
      const productId = req.params.id;
      const product = db.findById('products', productId);
      if (!product) {
        return error(res, 'Product not found', 404);
      }

      const shop = db.findById('shops', product.shopId);
      if (shop && shop.ownerId !== req.user.id && req.user.role !== 'admin') {
        return error(res, 'Forbidden: You do not own the shop of this product', 403);
      }

      const { name, description, category, price, stock, imageUrl, status } = req.body;
      const updates = {};
      if (name) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      if (category) updates.category = category.trim();
      if (price !== undefined) {
        const p = parseFloat(price);
        if (isNaN(p) || p < 0) return error(res, 'Price must be non-negative', 400);
        updates.price = Math.round(p * 100) / 100;
      }
      if (stock !== undefined) {
        const s = parseInt(stock, 10);
        if (isNaN(s) || s < 0) return error(res, 'Stock must be non-negative integer', 400);
        updates.stock = s;
      }
      if (imageUrl !== undefined) updates.imageUrl = imageUrl;
      if (status) updates.status = status;

      const updated = db.updateById('products', productId, updates);
      return success(res, updated, 'Product updated successfully');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  deleteProduct(req, res) {
    try {
      const productId = req.params.id;
      const product = db.findById('products', productId);
      if (!product) {
        return error(res, 'Product not found', 404);
      }

      const shop = db.findById('shops', product.shopId);
      if (shop && shop.ownerId !== req.user.id && req.user.role !== 'admin') {
        return error(res, 'Forbidden: You do not own the shop of this product', 403);
      }

      db.updateById('products', productId, { status: 'archived' });
      return success(res, null, 'Product archived');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }
}

module.exports = new ProductController();
