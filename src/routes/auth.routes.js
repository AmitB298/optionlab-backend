// src/routes/auth.routes.js
const router = require('express').Router();
const { register, loginMpin, changeMpin, updateProfile } = require('../controllers/auth.direct');

router.post('/register',       register);
router.post('/login-mpin',     loginMpin);
router.post('/change-mpin',    changeMpin);
router.patch('/update-profile', updateProfile);

module.exports = router;
