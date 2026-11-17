const express = require('express');
const router = express.Router();
const productController = require('./productController');
const { authenticate } = require('../../core/middlewares/auth');

router.post('/', authenticate, (req, res) => productController.createProduct(req, res));
router.get('/', (req, res) => productController.listProducts(req, res));
router.get('/:id', (req, res) => productController.getProductById(req, res));
router.put('/:id', authenticate, (req, res) => productController.updateProduct(req, res));
router.delete('/:id', authenticate, (req, res) => productController.deleteProduct(req, res));

module.exports = router;
