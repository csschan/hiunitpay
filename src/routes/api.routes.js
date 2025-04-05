const express = require('express');
const router = express.Router();

// 导入控制器
const paymentController = require('../controllers/payment.controller');
const lpController = require('../controllers/lp.controller');
const contractController = require('../controllers/contract.controller');

// 支付意图路由
router.post('/payment-intent', paymentController.createPaymentIntent);
router.get('/payment-intent/user/:walletAddress', paymentController.getUserPaymentIntents);
router.get('/payment-intent/lp/:walletAddress', paymentController.getLPPaymentIntents);
router.get('/payment-intent/:id', paymentController.getPaymentIntent);
router.put('/payment-intent/:id/cancel', paymentController.cancelPaymentIntent);
router.put('/payment-intent/:id/confirm', paymentController.confirmPaymentIntent);

// LP路由
router.post('/lp/register', lpController.registerLP);
router.put('/lp/quota', lpController.updateQuota);
router.get('/lp/:walletAddress', lpController.getLP);
router.get('/lp/task-pool', lpController.getTaskPool);
router.post('/lp/task/:id/claim', lpController.claimTask);
router.post('/lp/task/:id/mark-paid', lpController.markTaskPaid);

// 合约路由
router.get('/contract-info', contractController.getContractInfo);

module.exports = router;