const Razorpay = require('razorpay');
require('dotenv').config();

const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_TU48JXX4tzz4xv';
const key_secret = process.env.RAZORPAY_KEY_SECRET || 'fCil50KPK14prw7cXRkxJHGr';

const razorpayInstance = new Razorpay({
  key_id,
  key_secret,
});

const isTestKey = key_id.startsWith('rzp_test_');
console.log(`💳 Razorpay SDK Initialized [${isTestKey ? 'TEST / DEMO MODE' : 'LIVE PRODUCTION'}]: Key ID: ${key_id}`);

module.exports = {
  razorpay: razorpayInstance,
  key_id,
  key_secret,
  isTestKey,
};
