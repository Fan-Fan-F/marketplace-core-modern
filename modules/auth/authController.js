const { db } = require('../../core/db/storage');
const { hashPassword, verifyPassword, createToken } = require('../../core/utils/security');
const { success, error } = require('../../core/utils/response');
const config = require('../../core/config');

class AuthController {
  register(req, res) {
    try {
      const { name, email, password, role = 'buyer' } = req.body;
      if (!name || !email || !password) {
        return error(res, 'Name, email and password are required', 400);
      }

      const existing = db.findOne('users', { email: email.toLowerCase() });
      if (existing) {
        return error(res, 'Email already registered', 409);
      }

      const validRoles = ['buyer', 'seller', 'admin'];
      const userRole = validRoles.includes(role) ? role : 'buyer';

      const newUser = db.insert('users', {
        name,
        email: email.toLowerCase(),
        password: hashPassword(password),
        role: userRole,
        isSeller: userRole === 'seller' || userRole === 'admin'
      });

      const token = createToken({ userId: newUser.id, role: newUser.role }, config.jwtSecret);
      const { password: _, ...safeUser } = newUser;

      return success(res, { user: safeUser, token }, 'User registered successfully', 201);
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return error(res, 'Email and password are required', 400);
      }

      const user = db.findOne('users', { email: email.toLowerCase() });
      if (!user) {
        return error(res, 'Invalid email or password', 401);
      }

      const match = verifyPassword(password, user.password);
      if (!match) {
        return error(res, 'Invalid email or password', 401);
      }

      const token = createToken({ userId: user.id, role: user.role }, config.jwtSecret);
      const { password: _, ...safeUser } = user;

      // 如果是卖家，附带其拥有的一家或多家店铺 ID
      const userShops = db.find('shops', { ownerId: user.id });
      safeUser.shops = userShops.map(s => ({ id: s.id, name: s.name, status: s.status }));

      return success(res, { user: safeUser, token }, 'Login successful');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  getProfile(req, res) {
    try {
      const user = db.findById('users', req.user.id);
      if (!user) {
        return error(res, 'User not found', 404);
      }
      const { password: _, ...safeUser } = user;
      const userShops = db.find('shops', { ownerId: user.id });
      safeUser.shops = userShops;

      return success(res, safeUser, 'Profile retrieved');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }

  becomeSeller(req, res) {
    try {
      const updated = db.updateById('users', req.user.id, {
        role: 'seller',
        isSeller: true
      });
      const { password: _, ...safeUser } = updated;
      const token = createToken({ userId: safeUser.id, role: safeUser.role }, config.jwtSecret);

      return success(res, { user: safeUser, token }, 'Account upgraded to seller');
    } catch (err) {
      return error(res, err.message, 500);
    }
  }
}

module.exports = new AuthController();
