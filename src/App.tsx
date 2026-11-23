import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutPage } from './components/CheckoutPage';
import { Header } from './components/Header';
import { HomePage } from './components/HomePage';
import { OrderSuccessFlow } from './components/OrderSuccessFlow';
import { OrdersPage } from './components/OrdersPage';
import { ProductDetailPage } from './components/ProductDetailPage';
import { PRODUCTS } from './data/products';
import type {
  AppRoute,
  CartItem,
  CheckoutStep,
  Order,
  PriceBreakdown,
  Product,
  ProductReview,
  ProductVariant,
  ShippingAddress,
} from './types/store';
import { calculatePriceBreakdown, validateCoupon } from './utils/commerce';
import {
  getInitialAppRoute,
  isHistoryNavEntry,
  isSameRoute,
  parseHashToRoute,
  pushRouteStack,
  routeToHash,
  stepBackInStack,
  type HistoryNavEntry,
} from './utils/navigation';

const STORAGE_CART_KEY = 'utsavbazaar_cart_v1';
const STORAGE_ORDERS_KEY = 'utsavbazaar_orders_v1';
const STORAGE_COUPON_KEY = 'utsavbazaar_coupon_v1';
const STORAGE_REVIEWS_KEY = 'utsavbazaar_reviews_v1';
const LEGACY_STORAGE_ADDRESS_KEY = 'utsavbazaar_address_v1';

const EMPTY_ADDRESS: ShippingAddress = {
  fullName: '',
  phone: '',
  pincode: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  addressType: 'Home',
};

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

function hydrateProductsWithStoredReviews(): Product[] {
  if (typeof window === 'undefined') return PRODUCTS;
  const extraReviewsMap = readLocalStorage<Record<string, ProductReview[]>>(STORAGE_REVIEWS_KEY, {});
  return PRODUCTS.map((prod) => {
    const added = extraReviewsMap[prod.id];
    if (!added || added.length === 0) return prod;
    const nextReviews = [...added, ...prod.reviews];
    const nextCount = prod.reviewCount + added.length;
    const avg = nextReviews.reduce((sum, r) => sum + r.rating, 0) / nextReviews.length;
    return {
      ...prod,
      reviews: nextReviews,
      reviewCount: nextCount,
      rating: Math.round(avg * 10) / 10,
    };
  });
}

function resolveInitialSpaRoute(): AppRoute {
  if (typeof window === 'undefined') return { view: 'home' };
  return getInitialAppRoute(window.location.hash);
}

function getTitleForRoute(route: AppRoute, activeProductName?: string): string {
  switch (route.view) {
    case 'product':
      return activeProductName ? `${activeProductName} — UtsavBazaar` : 'Product Details — UtsavBazaar';
    case 'checkout':
      if (route.step === 'summary') return 'Order Summary — UtsavBazaar';
      if (route.step === 'payment') return 'Payments — UtsavBazaar';
      return 'Add Delivery Address — UtsavBazaar';
    case 'order-success':
      return 'Order Confirmed — UtsavBazaar';
    case 'orders':
      return 'My Orders — UtsavBazaar';
    case 'home':
    default:
      return 'UtsavBazaar — Festive Deals & Curated Essentials';
  }
}

export default function App() {
  const [products, setProducts] = useState<Product[]>(hydrateProductsWithStoredReviews);
  const [route, setRoute] = useState<AppRoute>(resolveInitialSpaRoute);
  const [activeCategory, setActiveCategory] = useState<string>('For You');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [cartItems, setCartItems] = useState<CartItem[]>(() =>
    readLocalStorage<CartItem[]>(STORAGE_CART_KEY, []),
  );
  const [orders, setOrders] = useState<Order[]>(() =>
    readLocalStorage<Order[]>(STORAGE_ORDERS_KEY, []),
  );
  const [checkoutAddress, setCheckoutAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);
  const [lastCheckoutSnapshot, setLastCheckoutSnapshot] = useState<{
    items: CartItem[];
    pricing: PriceBreakdown;
    address: ShippingAddress;
  } | null>(null);

  const [cartOpen, setCartOpen] = useState(false);
  const [couponCode, setCouponCode] = useState<string>(() =>
    readLocalStorage<string>(STORAGE_COUPON_KEY, ''),
  );
  const [couponFeedback, setCouponFeedback] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  const routeRef = useRef<AppRoute>(route);
  const routeStackRef = useRef<AppRoute[]>(
    route.view === 'home' ? [{ view: 'home' }] : [{ view: 'home' }, route],
  );
  const historyDepthRef = useRef<number>(0);
  const ignoreNextPopCountRef = useRef<number>(0);
  const popCleanupTimerRef = useRef<number | null>(null);
  const lastProductIdRef = useRef<string | undefined>(
    route.view === 'product' ? route.productId : undefined,
  );
  const checkoutOriginRef = useRef<'pdp' | 'cart'>('pdp');
  const cartItemsRef = useRef<CartItem[]>(cartItems);
  const cartOpenRef = useRef<boolean>(cartOpen);

  useEffect(() => {
    cartOpenRef.current = cartOpen;
  }, [cartOpen]);

  useEffect(() => {
    routeRef.current = route;
    if (route.view === 'product') {
      lastProductIdRef.current = route.productId;
    }
    const prod =
      route.view === 'product'
        ? products.find((p) => p.id === route.productId)
        : undefined;
    document.title = getTitleForRoute(route, prod?.name);
  }, [route, products]);

  useEffect(() => {
    cartItemsRef.current = cartItems;
    if (!lastProductIdRef.current && cartItems.length > 0) {
      lastProductIdRef.current = cartItems[0].productId;
    }
  }, [cartItems]);

  // Clear legacy prefill address and initialize instant SPA history navigation
  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_ADDRESS_KEY);
    } catch {
      // ignore
    }

    const initial = routeRef.current;
    const initialEntry: HistoryNavEntry = {
      appHistory: true,
      route: initial,
      cartOpen: false,
      depth: 0,
    };
    window.history.replaceState(initialEntry, '', routeToHash(initial));

    const handlePopState = (event: PopStateEvent) => {
      if (ignoreNextPopCountRef.current > 0) {
        ignoreNextPopCountRef.current -= 1;
        if (ignoreNextPopCountRef.current === 0 && popCleanupTimerRef.current !== null) {
          window.clearTimeout(popCleanupTimerRef.current);
          popCleanupTimerRef.current = null;
        }
        return;
      }

      const current = routeRef.current;
      const effectiveLastProductId =
        lastProductIdRef.current ?? cartItemsRef.current[0]?.productId;

      if (isHistoryNavEntry(event.state)) {
        const isForward = event.state.depth > historyDepthRef.current;
        let target = event.state.route;

        if (!isForward && current.view !== 'home' && isSameRoute(target, current)) {
          target = stepBackInStack(
            routeStackRef.current,
            current,
            effectiveLastProductId,
          ).nextRoute;
        }

        historyDepthRef.current = event.state.depth;
        routeRef.current = target;

        if (isForward) {
          routeStackRef.current = pushRouteStack(routeStackRef.current, target);
        } else {
          const currentStack = routeStackRef.current;
          let matchIdx = -1;
          for (let i = currentStack.length - 1; i >= 0; i -= 1) {
            if (isSameRoute(currentStack[i], target)) {
              matchIdx = i;
              break;
            }
          }
          if (matchIdx >= 0) {
            routeStackRef.current = currentStack.slice(0, matchIdx + 1);
          } else {
            routeStackRef.current =
              target.view === 'home' ? [{ view: 'home' }] : [{ view: 'home' }, target];
          }
        }

        setRoute(target);
        setCartOpen(event.state.cartOpen);
        window.scrollTo(0, 0);
        return;
      }

      let parsed = parseHashToRoute(window.location.hash);
      if (current.view !== 'home' && isSameRoute(parsed, current)) {
        parsed = stepBackInStack(
          routeStackRef.current,
          current,
          effectiveLastProductId,
        ).nextRoute;
      }
      historyDepthRef.current = 0;
      routeRef.current = parsed;
      routeStackRef.current =
        parsed.view === 'home' ? [{ view: 'home' }] : [{ view: 'home' }, parsed];
      setRoute(parsed);
      setCartOpen(false);
      window.scrollTo(0, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (popCleanupTimerRef.current !== null) {
        window.clearTimeout(popCleanupTimerRef.current);
      }
    };
  }, []);

  const navigateTo = useCallback(
    (nextRoute: AppRoute, options?: { replace?: boolean }) => {
      if (popCleanupTimerRef.current !== null) {
        window.clearTimeout(popCleanupTimerRef.current);
        popCleanupTimerRef.current = null;
      }
      ignoreNextPopCountRef.current = 0;

      if (nextRoute.view === 'product') {
        lastProductIdRef.current = nextRoute.productId;
      }

      const current = routeRef.current;
      if (!options?.replace && isSameRoute(current, nextRoute)) {
        setCartOpen(false);
        return;
      }

      if (options?.replace) {
        const nextStack =
          nextRoute.view === 'home'
            ? [{ view: 'home' } as AppRoute]
            : [...routeStackRef.current.slice(0, -1), nextRoute];
        routeStackRef.current = nextStack;
        const entry: HistoryNavEntry = {
          appHistory: true,
          route: nextRoute,
          cartOpen: false,
          depth: historyDepthRef.current,
        };
        window.history.replaceState(entry, '', routeToHash(nextRoute));
      } else {
        routeStackRef.current = pushRouteStack(routeStackRef.current, nextRoute);
        historyDepthRef.current += 1;
        const entry: HistoryNavEntry = {
          appHistory: true,
          route: nextRoute,
          cartOpen: false,
          depth: historyDepthRef.current,
        };
        window.history.pushState(entry, '', routeToHash(nextRoute));
      }

      routeRef.current = nextRoute;
      setCartOpen(false);
      setRoute(nextRoute);
      window.scrollTo(0, 0);
    },
    [],
  );

  const handleGoBack = useCallback(() => {
    if (cartOpenRef.current) {
      setCartOpen(false);
      return;
    }

    const current = routeRef.current;
    if (current.view === 'home') return;

    const effectiveLastProductId =
      lastProductIdRef.current ?? cartItemsRef.current[0]?.productId;
    const isCheckoutAddressFromCart =
      current.view === 'checkout' &&
      (current.step ?? 'address') === 'address' &&
      checkoutOriginRef.current === 'cart';

    const { nextRoute, nextStack } = isCheckoutAddressFromCart
      ? { nextRoute: { view: 'home' } as AppRoute, nextStack: [{ view: 'home' } as AppRoute] }
      : stepBackInStack(routeStackRef.current, current, effectiveLastProductId);

    // Update UI state synchronously so repeated/rapid Back taps never stick
    routeStackRef.current = nextStack;
    routeRef.current = nextRoute;
    setRoute(nextRoute);
    window.scrollTo(0, 0);

    // Sync browser history entry cleanly in the background
    if (historyDepthRef.current > 0) {
      historyDepthRef.current -= 1;
      ignoreNextPopCountRef.current += 1;
      if (popCleanupTimerRef.current !== null) {
        window.clearTimeout(popCleanupTimerRef.current);
      }
      popCleanupTimerRef.current = window.setTimeout(() => {
        ignoreNextPopCountRef.current = 0;
        popCleanupTimerRef.current = null;
        const syncedEntry: HistoryNavEntry = {
          appHistory: true,
          route: routeRef.current,
          cartOpen: false,
          depth: historyDepthRef.current,
        };
        window.history.replaceState(syncedEntry, '', routeToHash(routeRef.current));
      }, 220);
      window.history.back();
    } else {
      const entry: HistoryNavEntry = {
        appHistory: true,
        route: nextRoute,
        cartOpen: false,
        depth: 0,
      };
      window.history.replaceState(entry, '', routeToHash(nextRoute));
    }
  }, []);

  useEffect(() => {
    writeLocalStorage(STORAGE_CART_KEY, cartItems);
  }, [cartItems]);

  useEffect(() => {
    writeLocalStorage(STORAGE_ORDERS_KEY, orders);
  }, [orders]);

  useEffect(() => {
    writeLocalStorage(STORAGE_COUPON_KEY, couponCode);
  }, [couponCode]);

  const pricing = useMemo(
    () => calculatePriceBreakdown(cartItems, couponCode),
    [cartItems, couponCode],
  );

  const setSelectedCheckoutItem = (product: Product, variant: ProductVariant, quantity: number) => {
    lastProductIdRef.current = product.id;
    const nextItems: CartItem[] = [
      {
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        fullTitle: product.fullTitle ?? product.name,
        brand: product.brand,
        variantLabel: variant.label,
        image: product.image,
        assured: product.assured,
        price: variant.price,
        mrp: variant.mrp,
        quantity,
      },
    ];
    writeLocalStorage(STORAGE_CART_KEY, nextItems);
    setCartItems(nextItems);
  };

  const prepareFreshAddressEntry = (origin: 'pdp' | 'cart') => {
    setLastCheckoutSnapshot(null);
    setCheckoutAddress(EMPTY_ADDRESS);
    checkoutOriginRef.current = origin;
  };

  const handlePdpAddToCart = (product: Product, variant: ProductVariant, quantity: number) => {
    setSelectedCheckoutItem(product, variant, quantity);
    prepareFreshAddressEntry('pdp');
    navigateTo({ view: 'checkout', step: 'address' });
  };

  const handleBuyNow = (product: Product, variant: ProductVariant, quantity: number) => {
    setSelectedCheckoutItem(product, variant, quantity);
    prepareFreshAddressEntry('pdp');
    navigateTo({ view: 'checkout', step: 'address' });
  };

  const handleSaveAddress = useCallback((addr: ShippingAddress) => {
    setCheckoutAddress(addr);
  }, []);

  const handleAdvanceCheckoutStep = useCallback(
    (nextStep: CheckoutStep) => {
      navigateTo({ view: 'checkout', step: nextStep });
    },
    [navigateTo],
  );

  const handleReplaceToAddress = useCallback(() => {
    navigateTo({ view: 'checkout', step: 'address' }, { replace: true });
  }, [navigateTo]);

  const handleUpdateQty = (productId: string, variantId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.productId === productId && item.variantId === variantId
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const handleRemoveItem = (productId: string, variantId: string) => {
    setCartItems((prev) =>
      prev.filter((item) => !(item.productId === productId && item.variantId === variantId)),
    );
  };

  const handleApplyCoupon = (code: string) => {
    const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const res = validateCoupon(code, subtotal);
    setCouponFeedback({ valid: res.valid, message: res.message });
    if (res.valid && res.coupon) {
      setCouponCode(res.coupon.code);
    } else {
      setCouponCode('');
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setCouponFeedback(null);
  };

  const handleOrderComplete = (order: Order) => {
    const nextOrders = [order, ...orders];
    setLastCheckoutSnapshot({
      items: [...order.items],
      pricing: { ...order.pricing },
      address: { ...order.address },
    });
    setOrders(nextOrders);
    setLatestOrder(order);
    setCartItems([]);
    setCheckoutAddress(EMPTY_ADDRESS);
    setCouponCode('');
    setCouponFeedback(null);
    navigateTo({ view: 'order-success' });
  };

  const handleCancelOrder = (orderId: string) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, status: 'Cancelled' as const } : order,
      ),
    );
  };

  const handleAddReview = (productId: string, review: ProductReview) => {
    const extraReviewsMap = readLocalStorage<Record<string, ProductReview[]>>(
      STORAGE_REVIEWS_KEY,
      {},
    );
    extraReviewsMap[productId] = [review, ...(extraReviewsMap[productId] ?? [])];
    writeLocalStorage(STORAGE_REVIEWS_KEY, extraReviewsMap);

    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id !== productId) return prod;
        const nextReviews = [review, ...prod.reviews];
        const nextCount = prod.reviewCount + 1;
        const avg = nextReviews.reduce((sum, r) => sum + r.rating, 0) / nextReviews.length;
        return {
          ...prod,
          reviews: nextReviews,
          reviewCount: nextCount,
          rating: Math.round(avg * 10) / 10,
        };
      }),
    );
  };

  const navigateHome = (category?: string) => {
    if (category) setActiveCategory(category);
    if (route.view === 'home') {
      setCartOpen(false);
      return;
    }
    navigateTo({ view: 'home' });
  };

  const navigateProduct = (productId: string) => {
    navigateTo({ view: 'product', productId });
  };

  const navigateOrders = (highlightOrderId?: string) => {
    navigateTo(highlightOrderId ? { view: 'orders', highlightOrderId } : { view: 'orders' });
  };

  const checkoutBackLabel =
    lastProductIdRef.current ? 'Back to Product' : 'Back to Store';

  const activeProduct =
    route.view === 'product'
      ? products.find((p) => p.id === route.productId) ?? products[0]
      : null;

  const successOrder = latestOrder ?? orders[0] ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F3F6] text-[#111827]">
      {route.view === 'orders' && (
        <Header
          route={route}
          activeCategory={activeCategory}
          orderCount={orders.length}
          onNavigateHome={navigateHome}
          onNavigateOrders={() => navigateOrders()}
          onOpenCart={() => setCartOpen(true)}
        />
      )}

      <div className="flex-1">
        {route.view === 'home' && (
          <HomePage
            products={products}
            activeCategory={activeCategory}
            searchQuery={searchQuery}
            orderCount={orders.length}
            onCategoryChange={setActiveCategory}
            onSearchChange={setSearchQuery}
            onSelectProduct={navigateProduct}
            onOpenCart={() => setCartOpen(true)}
            onNavigateOrders={() => navigateOrders()}
          />
        )}

        {route.view === 'product' && activeProduct && (
          <ProductDetailPage
            key={activeProduct.id}
            product={activeProduct}
            relatedProducts={products.filter((p) => p.id !== activeProduct.id)}
            onBack={handleGoBack}
            onOpenCart={() => setCartOpen(true)}
            onAddToCart={handlePdpAddToCart}
            onBuyNow={handleBuyNow}
            onSelectProduct={navigateProduct}
            onAddReview={handleAddReview}
          />
        )}

        {route.view === 'checkout' && (
          <CheckoutPage
            step={route.step === 'payment' ? 3 : route.step === 'summary' ? 2 : 1}
            items={cartItems.length > 0 ? cartItems : (lastCheckoutSnapshot?.items ?? [])}
            pricing={cartItems.length > 0 ? pricing : (lastCheckoutSnapshot?.pricing ?? pricing)}
            initialAddress={
              cartItems.length > 0
                ? checkoutAddress
                : (lastCheckoutSnapshot?.address ?? checkoutAddress)
            }
            backLabel={checkoutBackLabel}
            onBack={handleGoBack}
            onAdvanceStep={handleAdvanceCheckoutStep}
            onReplaceToAddress={handleReplaceToAddress}
            onSaveAddress={handleSaveAddress}
            onBackToStore={() => navigateTo({ view: 'home' })}
            onOrderComplete={handleOrderComplete}
            onViewOrders={(orderId) => navigateOrders(orderId)}
          />
        )}

        {route.view === 'order-success' && (
          successOrder ? (
            <OrderSuccessFlow
              order={successOrder}
              onContinueShopping={() => navigateTo({ view: 'home' })}
            />
          ) : (
            <main className="max-w-2xl mx-auto px-4 py-16 text-center">
              <h1 className="font-display text-2xl font-bold text-[#111827]">
                No recent order found
              </h1>
              <p className="text-sm text-[#6B7280] mt-2 mb-6">
                Explore festive deals to place a new order.
              </p>
              <button
                type="button"
                onClick={() => navigateTo({ view: 'home' })}
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-white bg-[#2874F0] hover:bg-[#1E60D5] rounded-lg cursor-pointer"
              >
                Continue Shopping
              </button>
            </main>
          )
        )}

        {route.view === 'orders' && (
          <OrdersPage
            orders={orders}
            highlightOrderId={route.highlightOrderId}
            onBackToStore={handleGoBack}
            onCancelOrder={handleCancelOrder}
          />
        )}
      </div>

      {/* Quiet Editorial Footer (hidden on checkout & order-success so checkout matches full-height white flow) */}
      {route.view !== 'checkout' && route.view !== 'order-success' && (
        <footer className="border-t border-stone-200 bg-white mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-stone-500">
            <div>
              <p className="font-display text-sm font-bold text-stone-900">Shopping</p>
              <p className="mt-1">
                Curated festive essentials · Express pan-India shipping &amp; GST billing
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={() => navigateHome('For You')}
                className="hover:text-stone-900 cursor-pointer"
              >
                All Deals
              </button>
              <button
                type="button"
                onClick={() => navigateOrders()}
                className="hover:text-stone-900 cursor-pointer"
              >
                Track Orders
              </button>
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="hover:text-stone-900 cursor-pointer"
              >
                Shopping Cart
              </button>
              <span>© 2026 Shopping Retail</span>
            </div>
          </div>
        </footer>
      )}

      <CartDrawer
        open={cartOpen}
        items={cartItems}
        pricing={pricing}
        couponCode={couponCode}
        couponFeedback={couponFeedback}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={handleRemoveCoupon}
        onProceedToCheckout={() => {
          setCartOpen(false);
          prepareFreshAddressEntry('cart');
          navigateTo({ view: 'checkout', step: 'address' });
        }}
      />
    </div>
  );
}
