const express = require('express');
const router = express.Router();
const authController = require('./authController');
const { authenticate } = require('../../core/middlewares/auth');

router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.get('/profile', authenticate, (req, res) => authController.getProfile(req, res));
router.post('/become-seller', authenticate, (req, res) => authController.becomeSeller(req, res));

module.exports = router;
