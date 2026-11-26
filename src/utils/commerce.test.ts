import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../data/products';
import {
  calculateDiscountPercent,
  calculatePriceBreakdown,
  checkPincodeDelivery,
  detectCardBrand,
  filterProducts,
  formatCardNumber,
  formatCountdown,
  formatExpiry,
  formatFullDeliveryDate,
  formatINR,
  formatINRDecimal,
  formatLiveSaleCountdown,
  generateOrderId,
  getNextPingPongSlide,
  getProductGalleryImages,
  getRatingVerdict,
  sortAndFilterReviews,
  validateAddress,
  validateCoupon,
  validatePayment,
  clampGallerySlideIndex,
  MERCHANT_PAYEE_NAME,
  buildPaytmUpiUrl,
  buildPhonePeUpiUrl,
  launchUpiPayment,
  UPI_RETURN_CONFIRM_MIN_AWAY_MS,
  evaluateUpiAppReturn,
} from './commerce';

test('formatINR and formatINRDecimal format Indian currency accurately', () => {
  assert.equal(formatINR(0), '₹0');
  assert.equal(formatINR(999), '₹999');
  assert.equal(formatINR(12999), '₹12,999');
  assert.equal(formatINR(125000), '₹1,25,000');

  assert.equal(formatINRDecimal(489), '₹489.00');
  assert.equal(formatINRDecimal(6289), '₹6,289.00');
  assert.equal(formatINRDecimal(8790), '₹8,790.00');
});

test('formatCountdown formats live sale timer as MMm SSs', () => {
  assert.equal(formatCountdown(567), '09m 27s');
  assert.equal(formatCountdown(65), '01m 05s');
  assert.equal(formatCountdown(0), '00m 00s');
  assert.equal(formatCountdown(-10), '00m 00s');
});

test('formatLiveSaleCountdown formats home banner timer as Nmin SSsec', () => {
  assert.equal(formatLiveSaleCountdown(541), '9min 01sec');
  assert.equal(formatLiveSaleCountdown(567), '9min 27sec');
  assert.equal(formatLiveSaleCountdown(605), '10min 05sec');
  assert.equal(formatLiveSaleCountdown(0), '0min 00sec');
  assert.equal(formatLiveSaleCountdown(-5), '0min 00sec');
});

test('calculateDiscountPercent returns accurate percentage savings', () => {
  assert.equal(calculateDiscountPercent(6289, 489), 92);
  assert.equal(calculateDiscountPercent(8790, 699), 92);
  assert.equal(calculateDiscountPercent(1000, 1000), 0);
  assert.equal(calculateDiscountPercent(0, 500), 0);
});

test('validateCoupon enforces min subtotal, percent cap, and invalid codes', () => {
  const lowSubtotal = validateCoupon('DIWALI10', 500);
  assert.equal(lowSubtotal.valid, false);

  const validPercent = validateCoupon('diwali10', 3000);
  assert.equal(validPercent.valid, true);
  assert.equal(validPercent.discount, 300);

  const cappedPercent = validateCoupon('DIWALI10', 25000);
  assert.equal(cappedPercent.valid, true);
  assert.equal(cappedPercent.discount, 1500);

  const flatCoupon = validateCoupon('FESTIVE250', 2000);
  assert.equal(flatCoupon.valid, true);
  assert.equal(flatCoupon.discount, 250);

  const invalid = validateCoupon('FAKE99', 5000);
  assert.equal(invalid.valid, false);
});

test('calculatePriceBreakdown computes totals, shipping threshold, and coupon discount', () => {
  const lowCart = calculatePriceBreakdown([
    {
      productId: 'p1',
      variantId: 'v1',
      name: 'Test Item',
      brand: 'Brand',
      variantLabel: 'Default',
      image: '',
      price: 500,
      mrp: 800,
      quantity: 1,
    },
  ]);
  assert.equal(lowCart.subtotal, 500);
  assert.equal(lowCart.shippingFee, 0);
  assert.equal(lowCart.grandTotal, 500);
  assert.equal(lowCart.festiveSavings, 300);
  assert.equal(lowCart.totalSavings, 300);

  const highCart = calculatePriceBreakdown(
    [
      {
        productId: 'p1',
        variantId: 'v1',
        name: 'Headphones',
        brand: 'Solis',
        variantLabel: 'Obsidian',
        image: '',
        price: 3500,
        mrp: 7000,
        quantity: 2,
      },
    ],
    'DIWALI10',
  );
  assert.equal(highCart.itemCount, 2);
  assert.equal(highCart.subtotal, 7000);
  assert.equal(highCart.couponDiscount, 700);
  assert.equal(highCart.shippingFee, 0);
  assert.equal(highCart.grandTotal, 6300);
});

test('checkPincodeDelivery validates Indian pincodes and returns estimated dates', () => {
  const fixedDate = new Date('2026-10-20T00:00:00Z');
  const mumbai = checkPincodeDelivery('400001', fixedDate);
  assert.equal(mumbai.valid, true);
  assert.equal(mumbai.estimatedDays, 2);
  assert.equal(mumbai.codAvailable, true);

  const invalidShort = checkPincodeDelivery('4000');
  assert.equal(invalidShort.valid, false);

  const invalidZero = checkPincodeDelivery('000001');
  assert.equal(invalidZero.valid, false);

  assert.equal(formatFullDeliveryDate(3, new Date('2026-11-20T12:00:00Z')), 'Mon, Nov 23, 2026');
});

test('validateAddress allows proceeding even when all fields are completely empty', () => {
  const emptyErrors = validateAddress({
    fullName: '',
    phone: '',
    pincode: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    addressType: 'Home',
  });
  assert.deepEqual(emptyErrors, {});

  const singleWordErrors = validateAddress({
    fullName: 'Rahul',
    phone: '',
    pincode: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    addressType: 'Home',
  });
  assert.deepEqual(singleWordErrors, {});

  const nameOnlyValid = validateAddress({
    fullName: 'Rahul Sharma',
    phone: '',
    pincode: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    addressType: 'Home',
  });
  assert.deepEqual(nameOnlyValid, {});

  const validErrors = validateAddress({
    fullName: 'Aarav Patel',
    phone: '9876543210',
    pincode: '400001',
    addressLine1: 'Flat 402, Lotus Heights, MG Road',
    addressLine2: 'Near Metro Station',
    city: 'Mumbai',
    state: 'Maharashtra',
    addressType: 'Home',
  });
  assert.deepEqual(validErrors, {});
});

test('validatePayment validates UPI, Card, Net Banking, and COD accurately', () => {
  assert.ok(validatePayment('upi', { upiId: 'invalid-upi' }).upiId);
  assert.deepEqual(validatePayment('upi', { upiId: 'aarav.patel@okaxis' }), {});

  assert.ok(validatePayment('card', { cardNumber: '1234', cardExpiry: '99/99', cardCvv: '1', cardHolder: '' }).cardNumber);
  assert.deepEqual(
    validatePayment('card', {
      cardNumber: '4111 1111 1111 1111',
      cardExpiry: '08/29',
      cardCvv: '412',
      cardHolder: 'Aarav Patel',
    }),
    {},
  );

  assert.ok(validatePayment('netbanking', { bankName: '' }).bankName);
  assert.deepEqual(validatePayment('netbanking', { bankName: 'HDFC Bank' }), {});
  assert.deepEqual(validatePayment('cod', {}), {});
});

test('card formatting and brand detection helpers', () => {
  assert.equal(formatCardNumber('4111111111111111'), '4111 1111 1111 1111');
  assert.equal(formatExpiry('0928'), '09/28');
  assert.equal(detectCardBrand('4111'), 'Visa');
  assert.equal(detectCardBrand('5234'), 'Mastercard');
  assert.equal(detectCardBrand('6074'), 'RuPay');
});

test('filterProducts filters by category, For You, search query, and sorts properly', () => {
  const forYou = filterProducts(PRODUCTS, 'For You', '', 'featured');
  assert.equal(forYou.length, PRODUCTS.length);
  assert.equal(forYou[0].id, 'smartbuy-cordless-drill');
  assert.equal(forYou[1].id, 'green-soul-kiev-chair');
  assert.equal(forYou[2].id, 'leader-beast-26t');
  assert.equal(forYou[3].id, 'nilkamal-sleep-lite-mattress');
  assert.equal(forYou[4].id, 'milton-euroline-combo');
  assert.equal(forYou[5].id, 'trendylivings-dining-set');
  assert.equal(forYou[6].id, 'magnum-safari-luggage');
  assert.equal(forYou[7].id, 'plantex-7step-ladder');

  const electronics = filterProducts(PRODUCTS, 'Electronics', '', 'featured');
  assert.ok(electronics.length >= 2);
  assert.ok(electronics.every((p) => p.category === 'Electronics'));

  const ladderSearch = filterProducts(PRODUCTS, 'For You', 'Plantex', 'featured');
  assert.ok(ladderSearch.length >= 1);
  assert.equal(ladderSearch[0].id, 'plantex-7step-ladder');

  const sortedAsc = filterProducts(PRODUCTS, 'For You', '', 'price-asc');
  for (let i = 1; i < sortedAsc.length; i++) {
    assert.ok(sortedAsc[i - 1].variants[0].price <= sortedAsc[i].variants[0].price);
  }
});

test('generateOrderId follows UB-2026-XXXXX pattern', () => {
  assert.match(generateOrderId(1795179191234), /^UB-2026-\d{5}$/);
});

test('getRatingVerdict returns expected qualitative rating tiers', () => {
  assert.equal(getRatingVerdict(4.8), 'Excellent');
  assert.equal(getRatingVerdict(4.3), 'Very Good');
  assert.equal(getRatingVerdict(3.9), 'Good');
  assert.equal(getRatingVerdict(3.1), 'Average');
});

test('sortAndFilterReviews sorts by Most Helpful, Latest, Positive, and Negative', () => {
  const leader = PRODUCTS.find((p) => p.id === 'leader-beast-26t');
  assert.ok(leader);
  const sample = [
    { id: 'r1', author: 'A', city: 'X', rating: 4, date: 'Jan, 2024', timestamp: 1705000000, title: 'T1', comment: 'C1', helpfulCount: 968, verified: true },
    { id: 'r2', author: 'B', city: 'Y', rating: 3, date: 'Jun, 2024', timestamp: 1718000000, title: 'T2', comment: 'C2', helpfulCount: 43, verified: true },
    { id: 'r3', author: 'C', city: 'Z', rating: 5, date: 'Jun, 2025', timestamp: 1749000000, title: 'T3', comment: 'C3', helpfulCount: 113, verified: true },
  ];

  assert.equal(sortAndFilterReviews(sample, 'helpful')[0].id, 'r1');
  assert.equal(sortAndFilterReviews(sample, 'latest')[0].id, 'r3');

  const positive = sortAndFilterReviews(sample, 'positive');
  assert.equal(positive.length, 2);
  assert.equal(positive[0].id, 'r3');

  const negative = sortAndFilterReviews(sample, 'negative');
  assert.equal(negative.length, 1);
  assert.equal(negative[0].id, 'r2');
});

test('getNextPingPongSlide alternates left (0->1) then right (1->0) continuously for 2 banners', () => {
  const s1 = getNextPingPongSlide(0, 1, 2);
  assert.deepEqual(s1, { index: 1, direction: -1 });

  const s2 = getNextPingPongSlide(s1.index, s1.direction, 2);
  assert.deepEqual(s2, { index: 0, direction: 1 });

  const s3 = getNextPingPongSlide(s2.index, s2.direction, 2);
  assert.deepEqual(s3, { index: 1, direction: -1 });

  const s4 = getNextPingPongSlide(s3.index, s3.direction, 2);
  assert.deepEqual(s4, { index: 0, direction: 1 });

  // 3-banner ping-pong progression: 0 -> 1 -> 2 -> 1 -> 0
  const t1 = getNextPingPongSlide(0, 1, 3);
  assert.deepEqual(t1, { index: 1, direction: 1 });
  const t2 = getNextPingPongSlide(t1.index, t1.direction, 3);
  assert.deepEqual(t2, { index: 2, direction: -1 });
  const t3 = getNextPingPongSlide(t2.index, t2.direction, 3);
  assert.deepEqual(t3, { index: 1, direction: -1 });
  const t4 = getNextPingPongSlide(t3.index, t3.direction, 3);
  assert.deepEqual(t4, { index: 0, direction: 1 });

  // Single-slide edge case stays safely at 0
  assert.deepEqual(getNextPingPongSlide(0, 1, 1), { index: 0, direction: 1 });
});

test('every product provides 4 to 6 unique gallery images and clampGallerySlideIndex bounds indices', () => {
  assert.ok(PRODUCTS.length >= 16);
  for (const product of PRODUCTS) {
    const gallery = getProductGalleryImages(product);
    assert.ok(
      gallery.length >= 4 && gallery.length <= 6,
      `Expected 4-6 images for ${product.id}, got ${gallery.length}`,
    );
    assert.equal(new Set(gallery).size, gallery.length, `Duplicate gallery images on ${product.id}`);
    assert.equal(gallery[0], product.image);
  }

  assert.equal(clampGallerySlideIndex(-2, 5), 0);
  assert.equal(clampGallerySlideIndex(2.4, 5), 2);
  assert.equal(clampGallerySlideIndex(9, 5), 4);
  assert.equal(clampGallerySlideIndex(3, 1), 0);
});

test('buildPaytmUpiUrl and buildPhonePeUpiUrl build valid UPI deep links dynamically', () => {
  assert.equal(MERCHANT_PAYEE_NAME, 'Shopping');

  const paytmUrl = buildPaytmUpiUrl(478);
  const paytmParams = new URLSearchParams(paytmUrl.split('?')[1]);
  assert.ok(paytmUrl.startsWith('paytmmp://pay?pa='));
  assert.match(paytmParams.get('pa') ?? '', /^\d{10}@ptyes$/);
  assert.equal(paytmParams.get('pn'), 'Shopping');
  assert.equal(paytmParams.get('am'), '478.00');
  assert.equal(paytmParams.get('cu'), 'INR');
  assert.equal(paytmParams.get('tn'), 'Order Payment');

  const paytmHigh = buildPaytmUpiUrl(1299.5, { note: 'Chair Order' });
  assert.ok(paytmHigh.includes('am=1299.50'));
  assert.ok(paytmHigh.includes('tn=Chair%20Order'));

  const paytmSafe = buildPaytmUpiUrl(-50);
  assert.ok(paytmSafe.includes('am=0.00'));

  const phonePeUrl = buildPhonePeUpiUrl(478);
  const phonePeParams = new URLSearchParams(phonePeUrl.split('?')[1]);
  assert.ok(phonePeUrl.startsWith('phonepe://pay?pa='));
  assert.match(phonePeParams.get('pa') ?? '', /^\d{10}@ybl$/);
  assert.equal(phonePeParams.get('pn'), 'Shopping');
  assert.equal(phonePeParams.get('am'), '478.00');
  assert.equal(phonePeParams.get('cu'), 'INR');
  assert.equal(phonePeParams.get('tn'), 'Order Payment');

  const phonePeHigh = buildPhonePeUpiUrl(1499, { note: 'Mobile Order' });
  assert.ok(phonePeHigh.includes('am=1499.00'));
  assert.ok(phonePeHigh.includes('tn=Mobile%20Order'));

  const phonePeSafe = buildPhonePeUpiUrl(-10);
  assert.ok(phonePeSafe.includes('am=0.00'));
});

test('launchUpiPayment dispatches transient deep-link URI only on payment trigger', () => {
  const dispatched: string[] = [];
  const okPhonePe = launchUpiPayment('phonepe', 478, {
    dispatch: (uri) => dispatched.push(uri),
  });
  const okPaytm = launchUpiPayment('paytm', 999, {
    dispatch: (uri) => dispatched.push(uri),
  });

  assert.equal(okPhonePe, true);
  assert.equal(okPaytm, true);
  assert.equal(dispatched.length, 2);
  assert.ok(dispatched[0].startsWith('phonepe://pay?'));
  assert.ok(dispatched[0].includes('am=478.00'));
  assert.ok(dispatched[1].startsWith('paytmmp://pay?'));
  assert.ok(dispatched[1].includes('am=999.00'));
});

test('evaluateUpiAppReturn prevents premature order success before user returns from UPI app', () => {
  assert.equal(
    evaluateUpiAppReturn({ hasLeftApp: false, awayDurationMs: 10000 }),
    'stay_pending',
  );
  assert.equal(
    evaluateUpiAppReturn({ hasLeftApp: true, awayDurationMs: 0 }),
    'stay_pending',
  );
  assert.equal(
    evaluateUpiAppReturn({ hasLeftApp: true, awayDurationMs: UPI_RETURN_CONFIRM_MIN_AWAY_MS - 100 }),
    'stay_pending',
  );
  assert.equal(
    evaluateUpiAppReturn({ hasLeftApp: true, awayDurationMs: UPI_RETURN_CONFIRM_MIN_AWAY_MS }),
    'verify_and_complete',
  );
  assert.equal(
    evaluateUpiAppReturn({ hasLeftApp: true, awayDurationMs: 12000 }),
    'verify_and_complete',
  );
});




