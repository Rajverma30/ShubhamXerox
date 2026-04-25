// Theme Initialization (Instant to prevent flash)
(function () {
  const savedTheme = localStorage.getItem('shubham_theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

// Supabase Init
const supabaseUrl = 'https://acjnktdlqupwfeolkrfk.supabase.co';
const supabaseKey = 'sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5';
let _supabaseInstance = null;

function getSupabase() {
  if (_supabaseInstance) return _supabaseInstance;
  const sb = window.supabase || window.supabaseJs;
  if (sb && sb.createClient) {
    try {
      _supabaseInstance = sb.createClient(supabaseUrl, supabaseKey);
      console.log('? Supabase connected');
    } catch (e) {
      console.error("Supabase init error:", e);
    }
  }
  return _supabaseInstance;
}

// Constants
const ADMIN_PHONE = "6265660387";
const WHATSAPP_NUMBER = "919826462963";
const DELIVERY_FEE = 70;
const API_BASE = "https://shubhamxerox-production.up.railway.app";
const AUTH_TOKEN_KEY = "shubham_auth_token";
let products = [];
let isProductsLoading = true;

let cart = [];
let currentUser = null;
let reviews = {};
let selectedCategories = [];

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function setAuthToken(token) {
  if (!token) return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function parseJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(atob(payload).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function loadCurrentUserFromToken() {
  const token = getAuthToken();
  const payload = parseJwtPayload(token);
  if (!payload || !payload.phone) return null;
  return { phone: payload.phone, role: payload.role || "user", name: payload.name || "" };
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const auth = options.auth !== false;
  if (auth) {
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data;
}

const defaultSiteCategories = [
  "AKAR IAS HINDI MEDIUM PRE", "Arihant", "Champion Square English Medium", "Champion Square Hindi Medium", "CIVIL JOB", "Cosmos Publication", "Darpan Civil Services", "DEVANAGARI", "Exam Pedia", "Gagan Pratap Sir", "Ghatna Chakra", "KARMA IAS", "lucent", "MAINSWALA", "MGICS", "MPPSC MAINS TEST SERIES", "MPPSC PRE TEST 2026", "NEW BOOKS 📚", "NIRMAN IAS", "Omkar Publication", "Pariksha Portal", "Parikshadham", "Parmar SSC", "PT 365", "Punekar Publication", "Rakesh Yadav", "Saransh Ics", "Satyamev Jayate institute", "Selection Tak", "Shivaan Educations", "SHREE KABIR PUBLICATION", "SHUBHAM GUPTA SIR", "Stationery", "Tathyabaan", "Upsc Test Series", "UTKARSH CLASSESS", "XEROX"
];

let siteCategories = [];

// Safe Storage Initialization
try {
  cart = JSON.parse(localStorage.getItem('shubham_cart')) || [];
  currentUser = loadCurrentUserFromToken();
  reviews = JSON.parse(localStorage.getItem('shubham_reviews')) || {};
  siteCategories = JSON.parse(localStorage.getItem('shubham_categories')) || defaultSiteCategories;
} catch (e) {
  console.error("Storage parse error:", e);
}

const formatPrice = (price) => `₹${Number(price).toFixed(2)}`;

// --- Toast Notification ---
function showToast(message) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Reusable Confirm Popup (UI based, no browser confirm) ---
function showConfirmDialog(message, title = 'Please Confirm') {
  return new Promise((resolve) => {
    let overlay = document.getElementById('customConfirmOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'customConfirmOverlay';
      overlay.className = 'custom-confirm-overlay';
      overlay.innerHTML = `
        <div class="custom-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="customConfirmTitle">
          <h3 id="customConfirmTitle" class="custom-confirm-title"></h3>
          <p id="customConfirmMessage" class="custom-confirm-message"></p>
          <div class="custom-confirm-actions">
            <button type="button" id="customConfirmCancel" class="btn btn-outline-purple">Cancel</button>
            <button type="button" id="customConfirmOk" class="btn remove-btn">Yes, Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const titleEl = document.getElementById('customConfirmTitle');
    const messageEl = document.getElementById('customConfirmMessage');
    const cancelBtn = document.getElementById('customConfirmCancel');
    const okBtn = document.getElementById('customConfirmOk');

    titleEl.textContent = title;
    messageEl.textContent = message;
    overlay.classList.add('show');

    const cleanup = () => {
      overlay.classList.remove('show');
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEsc);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onOverlayClick = (event) => {
      if (event.target === overlay) {
        onCancel();
      }
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onEsc);
  });
}

// --- Data Fetching logic ---
function normalizeProductRecord(raw, index = 0) {
  const idNum = Number(raw?.id);
  const priceNum = Number(raw?.price);
  const originalPriceNum = Number(raw?.original_price);
  return {
    id: Number.isFinite(idNum) ? idNum : index + 1,
    name: (raw?.name || "").toString().trim() || `Product ${index + 1}`,
    category: (raw?.category || "").toString().trim() || "General",
    price: Number.isFinite(priceNum) ? priceNum : 0,
    original_price: Number.isFinite(originalPriceNum) ? originalPriceNum : null,
    img: (raw?.img || "").toString(),
    desc: (raw?.desc || "").toString(),
    exam: (raw?.exam || "").toString(),
  };
}

function getProductsEndpoint() {
  return `${supabaseUrl}/rest/v1/products?select=id,name,category,price,img,desc,original_price,exam&order=id.asc`;
}

function parseProductsCategoryParams() {
  const params = new URLSearchParams(window.location.search);
  const categoryRaw = params.get('category');
  if (!categoryRaw) return [];
  return categoryRaw
    .split(',')
    .map(v => decodeURIComponent(v).trim())
    .filter(Boolean);
}

function renderStoreProducts() {
  if (document.getElementById('featuredProducts')) {
    renderProductsGrid('featuredProducts', 4);
  }
  if (document.getElementById('allProductsContainer')) {
    renderMultiSelect();
    renderProductsGrid('allProductsContainer', null, selectedCategories);
  }
}

async function fetchProducts() {
  isProductsLoading = true;
  renderStoreProducts();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(getProductsEndpoint(), {
      method: "GET",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase products fetch failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : [];
    products = list.map((item, index) => normalizeProductRecord(item, index));
  } catch (e) {
    console.error("Products fetch exception:", e);
    products = [];
  } finally {
    isProductsLoading = false;
    renderStoreProducts();
  }
}

// --- Authentication Logic ---
function updateNavForUser() {
  const navContainers = document.querySelectorAll('.nav-links');
  if (navContainers.length === 0) return;

  navContainers.forEach(navContainer => {
    if (navContainer.id === 'adminNavLinks') return;
    let authLink = navContainer.querySelector('.dynamic-auth-link');
    if (!authLink) {
      if (document.getElementById('authLink')) authLink = document.getElementById('authLink');
      else {
        authLink = document.createElement('a');
        authLink.className = 'dynamic-auth-link';
        authLink.id = 'authLink';
        navContainer.appendChild(authLink);
      }
    }

    if (currentUser) {
      if (currentUser.role === "admin") {
        authLink.href = "admin.html";
        authLink.textContent = "Dashboard";
        authLink.style.color = "var(--primary)";
        authLink.onclick = null;
      } else {
        let myOrdersLink = navContainer.querySelector('.my-orders-link');
        if (!myOrdersLink) {
          myOrdersLink = document.createElement('a');
          myOrdersLink.className = 'my-orders-link';
          myOrdersLink.href = "my-orders.html";
          myOrdersLink.textContent = "My Orders";
          navContainer.insertBefore(myOrdersLink, authLink);
        }
        authLink.href = "#";
        authLink.textContent = "Logout";
        authLink.style.color = "#ff3b30";
        authLink.onclick = (e) => { e.preventDefault(); logout(); };
      }
    } else {
      authLink.href = "login.html";
      authLink.textContent = "Login";
      authLink.style.color = "var(--primary)";
      authLink.onclick = null;
    }
  });
}

async function requestRegisterOTP(btn) {
  const email = (document.getElementById('regEmail') || {}).value || '';
  if (!email || !email.includes('@')) {
    showToast("Enter a valid email address first.");
    return;
  }
  
  const originalText = btn.innerHTML;
  btn.classList.remove('loading'); // remove default loading class if any
  btn.disabled = true;
  
  // Start countdown IMMEDIATELY upon click
  let timeLeft = 30;
  btn.innerText = `OTP Sent (${timeLeft}s)`;
  
  const interval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      btn.innerHTML = originalText;
    } else {
      btn.innerText = `OTP Sent (${timeLeft}s)`;
    }
  }, 1000);
  
  try {
    await apiFetch("/send-otp", { method: "POST", body: { email }, auth: false });
    showToast("OTP sent successfully.");
  } catch (err) {
    showToast(err.message || "Failed to send OTP");
    // We do NOT clear the interval here, we force them to wait 30s before retrying
  }
}

async function requestForgotPasswordOTP(btn) {
  const email = (document.getElementById('forgotEmail') || {}).value || '';
  if (!email || !email.includes('@')) {
    showToast("Enter a valid email address first.");
    return;
  }
  
  const originalText = btn.innerHTML;
  btn.classList.remove('loading');
  btn.disabled = true;
  
  // Start countdown IMMEDIATELY upon click
  let timeLeft = 30;
  btn.innerText = `OTP Sent (${timeLeft}s)`;
  
  const interval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(interval);
      btn.disabled = false;
      btn.innerHTML = originalText;
    } else {
      btn.innerText = `OTP Sent (${timeLeft}s)`;
    }
  }, 1000);
  
  try {
    await apiFetch("/send-otp", { method: "POST", body: { email }, auth: false });
    showToast("OTP sent successfully.");
  } catch (err) {
    showToast(err.message || "Failed to send OTP");
    // Force them to wait 30s even if it fails, to prevent spam
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  let originalBtnText = "";
  if (btn) {
    originalBtnText = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner"></span> Logging in...';
  }
  const identifier = document.getElementById('phone').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const data = await apiFetch("/login", { method: "POST", body: { identifier, password }, auth: false });
    setAuthToken(data.token);
    currentUser = data.user || loadCurrentUserFromToken();
    window.location.href = (currentUser && currentUser.role === "admin") ? "admin.html" : "index.html";
  } catch (err) {
    showToast("Login failed");
    if (btn) {
      btn.classList.remove('loading');
      btn.innerHTML = originalBtnText;
    }
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  let originalBtnText = "";
  if (btn) {
    originalBtnText = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner"></span> Registering...';
  }
  const name = document.getElementById('regName').value;
  const phone = document.getElementById('regPhone').value;
  const email = document.getElementById('regEmail').value;
  const otp = document.getElementById('regOtp').value;
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;

  try {
    await apiFetch("/verify-otp", { method: "POST", body: { email, otp }, auth: false });
  } catch (err) {
    showToast(err.message || "Invalid OTP");
    if (btn) {
      btn.classList.remove('loading');
      btn.innerHTML = originalBtnText;
    }
    return;
  }
  try {
    const data = await apiFetch("/register", { method: "POST", body: { phone, email, name, password }, auth: false });
    setAuthToken(data.token);
    currentUser = data.user || loadCurrentUserFromToken();
    window.location.href = "index.html";
  } catch (err) {
    showToast(err.message || "Registration failed");
    if (btn) {
      btn.classList.remove('loading');
      btn.innerHTML = originalBtnText;
    }
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const btn = document.getElementById('resetBtn');
  if (btn) btn.classList.add('loading');
  const email = document.getElementById('forgotEmail').value;
  const otp = document.getElementById('forgotOtp').value;
  const newPassword = document.getElementById('forgotNewPassword').value;
  const confirmPassword = document.getElementById('forgotConfirmPassword').value;

  try {
    await apiFetch("/verify-otp", { method: "POST", body: { email, otp }, auth: false });
  } catch (err) {
    showToast(err.message || "Invalid OTP");
    if (btn) btn.classList.remove('loading');
    return;
  }
  try {
    await apiFetch("/reset-password", { method: "POST", body: { email, otp, new_password: newPassword }, auth: false });
    showToast("Password reset successful. Login now.");
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) forgotForm.reset();
  } catch (err) {
    showToast(err.message || "Reset failed");
  } finally {
    if (btn) btn.classList.remove('loading');
  }
}

function logout() {
  clearAuthToken();
  currentUser = null;
  window.location.href = "index.html";
}

// --- Secure Full-Stack Razorpay Integration ---
async function processSecureRazorpayPayment(amount, orderData, orderType, onComplete) {
  try {
    // 1. Create order on backend
    const createRes = await fetch("https://shubhamxerox-production.up.railway.app/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
      body: JSON.stringify({ amount: amount, currency: "INR" })
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(err.detail || "Failed to create payment order");
    }

    const { order_id, key_id, amount: rzpAmount } = await createRes.json();

    // 2. Open Razorpay Checkout Widget
    const options = {
      key: key_id,
      amount: rzpAmount,
      currency: "INR",
      name: "Shubham Xerox",
      description: "Secure Payment",
      order_id: order_id,
      handler: async function (response) {
        // 3. Send signature to backend for verification and insertion
        try {
          showToast("Payment captured. Verifying securely...");
          const verifyRes = await fetch("https://shubhamxerox-production.up.railway.app/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              order_type: orderType,
              order_data: orderData
            })
          });

          if (verifyRes.ok) {
            onComplete(true, response.razorpay_payment_id);
          } else {
            const err = await verifyRes.json();
            showToast("Payment Verification Failed: " + (err.detail || "Unknown error"));
            onComplete(false);
          }
        } catch (e) {
          console.error("Verification Error:", e);
          showToast("Payment Network Error during verification");
          onComplete(false);
        }
      },
      prefill: {
        name: orderData.customer_name || orderData.customer || "Customer",
        contact: orderData.customer_phone || orderData.customerphone || ""
      },
      theme: { color: "#3399cc" },
      modal: {
        ondismiss: function () {
          showToast("Payment interface closed safely.");
          onComplete(false);
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {
      console.error("Payment failed", response.error);
      showToast("Payment Failed: " + response.error.description);
      onComplete(false);
    });
    rzp.open();

  } catch (error) {
    console.error("Payment initialization error:", error);
    showToast("Error initializing secure payment: " + error.message);
    onComplete(false);
  }
}

// --- Cart Management ---
function updateCartBadge() {
  const badges = document.querySelectorAll('.cart-badge');
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  badges.forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  });
}

function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const existingItem = cart.find(item => item.id === productId);
  if (existingItem) { existingItem.quantity += 1; }
  else { cart.push({ ...product, quantity: 1 }); }

  saveCart();
  showToast(`${product.name} added to cart!`);
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  saveCart();
  if (document.getElementById('cartItems')) renderCart();
}

function updateQuantity(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (item) {
    item.quantity += delta;
    if (item.quantity <= 0) removeFromCart(productId);
    else {
      saveCart();
      if (document.getElementById('cartItems')) renderCart();
    }
  }
}

function saveCart() {
  localStorage.setItem('shubham_cart', JSON.stringify(cart));
  updateCartBadge();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

const SAVED_ADDR_PREFIX = 'shubham_delivery_addr_';

function getSavedDeliveryDetails() {
  if (!currentUser || !currentUser.phone) return {};
  try {
    return JSON.parse(localStorage.getItem(SAVED_ADDR_PREFIX + currentUser.phone) || '{}');
  } catch (e) {
    return {};
  }
}

function saveSavedDeliveryDetails(partial) {
  if (!currentUser || !currentUser.phone || !partial || typeof partial !== 'object') return;
  const cur = getSavedDeliveryDetails();
  const next = { ...cur };
  Object.keys(partial).forEach((k) => {
    const v = partial[k];
    if (v != null && String(v).trim() !== '') next[k] = String(v).trim();
  });
  localStorage.setItem(SAVED_ADDR_PREFIX + currentUser.phone, JSON.stringify(next));
}

function normalizeOrderItems(items) {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const p = JSON.parse(items);
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

const ORDER_TRACKING_DURATION_MS = 48 * 60 * 60 * 1000;
const ORDER_TRACK_LABELS = ['Order placed', 'Printing', 'Ready', 'Out for delivery', 'Delivered'];

function getBookOrderPlacedAtMs(o) {
  if (o.created_at) {
    const t = new Date(o.created_at).getTime();
    if (!isNaN(t)) return t;
  }
  const d = new Date(o.date);
  if (!isNaN(d.getTime())) return d.getTime();
  const m = String(o.id || '').match(/ORD(\d{10,})/);
  if (m) return parseInt(m[1], 10);
  return Date.now();
}

function computeBookTrackingCompletedSteps(o) {
  const placed = getBookOrderPlacedAtMs(o);
  const elapsed = Math.max(0, Date.now() - placed);
  const phaseMs = ORDER_TRACKING_DURATION_MS / 4;
  let completed = 1 + Math.floor(elapsed / phaseMs);
  completed = Math.min(5, Math.max(1, completed));
  const st = String(o.status || 'Pending').trim();
  if (st === 'Delivered') completed = 5;
  else if (st === 'Shipped') completed = Math.max(completed, 4);
  return completed;
}

function getPhotocopyPlacedAtMs(o) {
  if (o.created_at) {
    const t = new Date(o.created_at).getTime();
    if (!isNaN(t)) return t;
  }
  const m = String(o.id || '').match(/COPY(\d{10,})/);
  if (m) return parseInt(m[1], 10);
  return Date.now();
}

function computePhotocopyTrackingCompletedSteps(o) {
  const st = String(o.status || 'Pending').trim();
  if (st === 'Cancelled') return -1;
  const placed = getPhotocopyPlacedAtMs(o);
  const elapsed = Math.max(0, Date.now() - placed);
  const phaseMs = ORDER_TRACKING_DURATION_MS / 4;
  let completed = 1 + Math.floor(elapsed / phaseMs);

  if (o.delivery_mode === 'collect') {
    completed = Math.min(4, Math.max(1, completed));
    if (st === 'Completed' || st === 'Ready') completed = 4;
    else if (st === 'Processing') completed = Math.max(completed, 2);
  } else {
    completed = Math.min(5, Math.max(1, completed));
    if (st === 'Completed') completed = 5;
    else if (st === 'Ready' || st === 'Shipped') completed = Math.max(completed, 3);
    else if (st === 'Processing') completed = Math.max(completed, 2);
  }
  return completed;
}

function getTrackingLabelsArray(o) {
  if (o && o.delivery_mode === 'collect') {
    return ['Order Received', 'Printing', 'Completed', 'Collect at store'];
  }
  return ORDER_TRACK_LABELS;
}

function buildOrderTrackingTimelineHTML(completedSteps, opts, orderObj) {
  const hint = (opts && opts.hint) || 'Status moves forward automatically over about 48 hours. We also update when your order ships.';
  if (completedSteps < 0) {
    return `
      <div class="order-tracking order-tracking--cancelled">
        <div class="order-tracking-title">Order status</div>
        <p class="order-tracking-cancel-msg">This order was cancelled.</p>
      </div>`;
  }
  const labels = getTrackingLabelsArray(orderObj);
  const items = labels.map((label, i) => {
    const done = i < completedSteps;
    const current = i === completedSteps && completedSteps < labels.length;
    const pending = i > completedSteps;
    let cls = 'order-tracking-step';
    if (done) cls += ' is-done';
    if (current) cls += ' is-current';
    if (pending) cls += ' is-pending';
    return `
      <li class="${cls}">
        <span class="order-tracking-dot" aria-hidden="true"></span>
        <div class="order-tracking-step-body">
          <span class="order-tracking-label">${label}</span>
          ${current ? '<span class="order-tracking-badge">In progress</span>' : ''}
        </div>
      </li>`;
  }).join('');
  return `
    <div class="order-tracking">
      <div class="order-tracking-title">Track your order</div>
      <p class="order-tracking-hint">${hint}</p>
      <ol class="order-tracking-steps" aria-label="Order progress">${items}</ol>
    </div>`;
}

// --- Checkout Logic ---
async function handleCheckout(e) {
  e.preventDefault();

  if (!currentUser) {
    showToast("Please login to place an order.");
    setTimeout(() => window.location.href = "login.html", 1500);
    return;
  }

  if (cart.length === 0) {
    showToast("Your cart is empty!");
    setTimeout(() => window.location.href = "products.html", 1500);
    return;
  }

  const name = document.getElementById('fullName').value;
  const address = document.getElementById('address').value;
  const paymentMethod = document.querySelector('input[name="payment"]:checked').value;

  const orderData = {
    id: "ORD" + Date.now(),
    customer: currentUser.name,
    customerphone: currentUser.phone,
    address: address,
    items: cart,
    total: getCartTotal() + DELIVERY_FEE,
    method: paymentMethod,
    status: "Pending",
    date: new Date().toLocaleString()
  };

  if (paymentMethod === "Online") {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing Secure Payment...'; }

    processSecureRazorpayPayment(orderData.total, orderData, 'books', (success, txnId) => {
      if (success) {
        // Clear cart since backend successfully inserted the row
        cart = [];
        saveCart();
        const cityEl = document.getElementById('city');
        const pinEl = document.getElementById('pincode');
        saveSavedDeliveryDetails({
          street: orderData.address,
          city: cityEl ? cityEl.value.trim() : '',
          pincode: pinEl ? pinEl.value.trim() : ''
        });
        sessionStorage.setItem("orderBanner", "success");
        window.location.href = "my-orders.html";
      } else {
        if (btn) { btn.disabled = false; btn.textContent = 'Place Order'; }
      }
    });

  } else {
    // Standard COD bypasses Python API, inserting directly via JS client
    completeOrder(orderData, false);
  }
}

async function completeOrder(orderData) {
  const supabase = getSupabase();
  if (supabase) {
    try {
      let { error } = await supabase.from('orders').insert(orderData);
      if (error && error.message && /created_at|column/i.test(error.message)) {
        const slim = { ...orderData };
        delete slim.created_at;
        const r2 = await supabase.from('orders').insert(slim);
        error = r2.error;
      }
    } catch (e) { }
  }
  const cityEl = document.getElementById('city');
  const pinEl = document.getElementById('pincode');
  saveSavedDeliveryDetails({
    street: orderData.address,
    city: cityEl ? cityEl.value.trim() : '',
    pincode: pinEl ? pinEl.value.trim() : ''
  });
  cart = [];
  saveCart();
  sessionStorage.setItem("orderBanner", "cod");
  window.location.href = "my-orders.html";
}


// --- Rendering Data UI ---
function createProductCard(product) {
  return `
    <div class="product-card">
      <a href="product.html?id=${product.id}" class="product-link-wrapper" style="display: contents;">
        <div class="product-img-wrapper" style="background:white; position:relative;">
          <div style="position:absolute; top:8px; right:8px; background:linear-gradient(135deg, #ffc107, #ff9800); color:#fff; font-size:0.65rem; font-weight:800; padding:4px 8px; border-radius:4px; box-shadow:0 2px 4px rgba(0,0,0,0.2); letter-spacing:0.5px; z-index:2;">BEST SELLER</div>
          <img src="${(product.img && product.img.split('|')[0]) || 'default-book.png'}" alt="${product.name}" loading="lazy">
        </div>
        <div class="category-tag">${product.category}</div>
        <h3 class="product-title">${product.name}</h3>
      </a>
      </a>
      <div class="product-footer">
        <div class="product-price">
          ${(() => {
      if (product.original_price && product.original_price > product.price) {
        const diff = product.original_price - product.price;
        const disc = Math.round((diff / product.original_price) * 100);
        return `<span class="price-selling">${formatPrice(product.price)}</span>
                      <span class="price-original">${formatPrice(product.original_price)}</span>
                      <span class="price-discount">${disc}% Off</span>`;
      } else {
        return `<span class="price-selling">${formatPrice(product.price)}</span>`;
      }
    })()}
        </div>
        <button class="add-to-cart-btn" onclick="addToCart(${product.id})" aria-label="Add to cart">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 20a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"></path><path d="M20 20a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"></path><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
        </button>
      </div>
    </div>
  `;
}

// --- Storefront Multi-Select Filter ---
window.toggleMultiSelect = function () {
  const dropdown = document.getElementById('multiSelectDropdown');
  if (dropdown) dropdown.classList.toggle('active');
};

window.filterMultiSelect = function () {
  const q = document.getElementById('multiSelectSearch').value.toLowerCase();
  const options = document.querySelectorAll('.multi-select-option');
  options.forEach(opt => {
    const text = opt.querySelector('span').textContent.toLowerCase();
    opt.style.display = text.includes(q) ? 'flex' : 'none';
  });
};

function renderMultiSelect() {
  const container = document.getElementById('multiSelectOptionsList');
  if (!container) return;
  let safeSiteCategories = Array.isArray(siteCategories) ? siteCategories : defaultSiteCategories;
  const allCats = [...new Set([...safeSiteCategories, ...products.map(p => p.category)])].sort();

  container.innerHTML = allCats.map(c => `
    <label class="multi-select-option">
      <input type="checkbox" value="${c}" ${selectedCategories.includes(c) ? "checked" : ""} onchange="handleCategoryToggle(this)">
      <span>${c}</span>
    </label>
  `).join('');
  updateActiveCategoryTags();
}

window.handleCategoryToggle = function (checkbox) {
  const val = checkbox.value;
  if (checkbox.checked) {
    if (!selectedCategories.includes(val)) selectedCategories.push(val);
  } else {
    selectedCategories = selectedCategories.filter(c => c !== val);
  }
  updateActiveCategoryTags();
  renderProductsGrid('allProductsContainer', null, selectedCategories);
};

window.resetCategories = function () {
  selectedCategories = [];
  const checkboxes = document.querySelectorAll('.multi-select-option input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = false);
  updateActiveCategoryTags();
  renderProductsGrid('allProductsContainer', null, selectedCategories);

  const dropdown = document.getElementById('multiSelectDropdown');
  if (dropdown) dropdown.classList.remove('active');
};

function updateActiveCategoryTags() {
  const container = document.getElementById('activeCategoryTags');
  if (!container) return;
  container.innerHTML = selectedCategories.map(c => `
    <div class="active-cat-tag">
      ${c} <span style="cursor:pointer; margin-left:4px;" onclick="uncheckCategory('${c}')">×</span>
    </div>
  `).join('');

  const label = document.getElementById('multiSelectLabel');
  if (label) {
    label.textContent = selectedCategories.length > 0 ? `${selectedCategories.length} Selected` : "Select Categories...";
  }
}

window.uncheckCategory = function (cat) {
  const checkbox = document.querySelector(`.multi-select-option input[value="${cat}"]`);
  if (checkbox) {
    checkbox.checked = false;
    handleCategoryToggle(checkbox);
  }
};

function renderProductsGrid(containerId, limit = null, filterCategories = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let filtered = [...products];
  const selectedCats = Array.isArray(filterCategories) ? filterCategories.filter(Boolean) : [];
  if (selectedCats.length > 0) {
    const categorySet = new Set(selectedCats);
    const byCategory = filtered.filter(p => categorySet.has(p.category));
    // Keep UX safe if URL has unknown category.
    filtered = byCategory.length > 0 ? byCategory : filtered;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const examFilter = urlParams.get('exam');
  const formatFilter = urlParams.get('format');

  if (examFilter) {
    const originalExam = examFilter.toLowerCase();
    const qExams = originalExam.split(/[\s/]+/).filter(t => t);
    filtered = filtered.filter(p => {
      if (p.exam && p.exam.toLowerCase().includes(originalExam)) return true;
      const nameL = (p.name || '').toLowerCase();
      return qExams.some(token => nameL.includes(token));
    });
  }

  if (formatFilter) {
    if (formatFilter === 'pdf') {
      filtered = filtered.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const nameL = (p.name || '').toLowerCase();
        return cat.includes('pdf') || cat.includes('notes') || cat.includes('syllabus') || nameL.includes('pdf') || nameL.includes('syllabus');
      });
    } else if (formatFilter === 'book') {
      filtered = filtered.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const nameL = (p.name || '').toLowerCase();
        return !cat.includes('pdf') && !cat.includes('notes') && !cat.includes('syllabus') && !nameL.includes('pdf') && !nameL.includes('syllabus');
      });
    }
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput && searchInput.value) {
    const spaceTokens = searchInput.value.toLowerCase().split(/\s+/).filter(t => t);
    filtered = filtered.filter(p => {
      const searchableStr = `${p.name || ''} ${p.exam || ''} ${p.category || ''}`.toLowerCase();
      return spaceTokens.every(spaceToken => {
        const slashTokens = spaceToken.split('/').filter(t => t);
        return slashTokens.some(slashToken => searchableStr.includes(slashToken));
      });
    });
  }
  if (limit) filtered = filtered.slice(0, limit);
  if (isProductsLoading && filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; display:flex; justify-content:center; padding: 60px;"><div class="loader" style="width:40px; height:40px; border:4px solid var(--border-color); border-top-color:var(--primary); border-radius:50%; animation:spin 1s linear infinite;"></div></div>';
    return;
  }
  if (filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 1.1rem; background: var(--card-bg); border-radius: var(--radius-md); border: 1px solid var(--border-color);"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; opacity: 0.5;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><br>No books or notes found for your selection.</div>';
  } else {
    container.innerHTML = filtered.map(createProductCard).join('');
  }
}

// --- Exam Bot Logic ---
const examList = [
  "MPPSC", "UPSC/IAS", "SSC CGL", "SSC CHSL", "Banking PO",
  "Banking Clerk", "Patwari", "Railway RRB NTPC", "Railway Group D",
  "MPSI", "MP Police Constable", "CTET/TET", "NDA/CDS", "State PSC",
  "GATE", "JEE/NEET"
];

let selectedBotExam = "";

function typeBotText() {
  const el = document.getElementById('examBotTypingText');
  if (!el) return;
  const text = "I am your exam prep bot, how can I help you?";
  let i = 0;
  el.innerHTML = '';
  function typeChar() {
    if (i < text.length) {
      el.innerHTML += text.charAt(i);
      i++;
      setTimeout(typeChar, 50);
    } else {
      el.style.borderRight = 'none';
    }
  }
  setTimeout(typeChar, 500);
}

document.addEventListener('DOMContentLoaded', () => {
  typeBotText();
  const botInput = document.getElementById('examBotInput');
  const suggestionsBox = document.getElementById('examBotSuggestions');

  if (botInput && suggestionsBox) {
    botInput.addEventListener('input', (e) => {
      const val = e.target.value.trim().toLowerCase();
      if (!val) {
        suggestionsBox.style.display = 'none';
        return;
      }

      const matches = examList.filter(ex => ex.toLowerCase().includes(val));

      if (matches.length > 0) {
        suggestionsBox.innerHTML = matches.map(m =>
          `<div class="exam-suggestion" style="padding: 12px 24px; cursor: pointer; color: var(--text-main); border-bottom: 1px solid var(--border-color); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" onclick="selectBotExam('${m}')">${m}</div>`
        ).join('');
        suggestionsBox.style.display = 'block';
      } else {
        suggestionsBox.innerHTML = `<div style="padding: 12px 24px; color: var(--text-muted); font-style: italic;">Search for '${val}'</div>`;
        suggestionsBox.style.display = 'block';
      }
    });

    botInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = botInput.value.trim();
        if (val) selectBotExam(val);
      }
    });

    document.addEventListener('click', (e) => {
      if (!botInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.style.display = 'none';
      }
    });
  }
});

window.selectBotExam = function (exam) {
  const botInput = document.getElementById('examBotInput');
  const suggestionsBox = document.getElementById('examBotSuggestions');
  const formatOptions = document.getElementById('examBotFormatOptions');

  botInput.value = exam;
  selectedBotExam = exam;
  suggestionsBox.style.display = 'none';
  formatOptions.style.display = 'flex';
};

window.selectExamFormat = function (format) {
  if (!selectedBotExam) {
    const val = document.getElementById('examBotInput').value.trim();
    if (val) selectedBotExam = val;
    else return;
  }
  window.location.href = `products.html?exam=${encodeURIComponent(selectedBotExam)}&format=${format}`;
};

function renderCart() {
  const itemsContainer = document.getElementById('cartItems');
  const detailsContainer = document.getElementById('cartSummaryDetails');
  if (!itemsContainer || !detailsContainer) return;

  if (cart.length === 0) {
    itemsContainer.innerHTML = '<p>Your cart is empty.</p>';
    detailsContainer.innerHTML = '';
    return;
  }

  itemsContainer.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${(item.img && item.img.split('|')[0]) || ''}" class="cart-item-img" alt="${item.name}">
      <div class="cart-item-details">
        <div class="cart-item-title">${item.name}</div>
        <div class="cart-item-price">${formatPrice(item.price)}</div>
      </div>
      <div class="quantity-selector">
        <button class="quantity-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
        <span>${item.quantity}</span>
        <button class="quantity-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
      </div>
      <button class="remove-btn" onclick="removeFromCart(${item.id})">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </div>
  `).join('');

  detailsContainer.innerHTML = `
    <div class="summary-row"><span>Subtotal</span><span>${formatPrice(getCartTotal())}</span></div>
    <div class="summary-total"><span>Total</span><span>${formatPrice(getCartTotal())}</span></div>
    <a href="checkout.html" class="btn btn-primary" style="width: 100%; margin-top: 24px; text-align:center;">Proceed to Checkout</a>
  `;
}

// --- Admin ---
function renderAdminCategories() {
  const container = document.getElementById('adminCategoriesList');
  if (container) {
    siteCategories.sort();
    container.innerHTML = siteCategories.map(cat => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--card-bg); padding:12px; border-radius:6px; border:1px solid var(--border-color);">
        <span style="font-weight: 500; color: var(--text-main);">${cat}</span>
        <button class="remove-btn" onclick="removeAdminCategory('${cat.replace(/'/g, "\\'")}')">Remove</button>
      </div>
    `).join('');
  }


  // Also update datalist for Add Product
  const dataList = document.getElementById('categoryOptions');
  if (dataList) {
    dataList.innerHTML = siteCategories.map(cat => `<option value="${cat}">`).join('');
  }
}

window.removeAdminCategory = function (cat) {
  siteCategories = siteCategories.filter(c => c !== cat);
  localStorage.setItem('shubham_categories', JSON.stringify(siteCategories));
  renderAdminCategories();
  showToast(`Category removed`);
};

async function handleAddCategory(e) {
  e.preventDefault();
  const newCat = document.getElementById('newCategoryName').value.trim();
  if (!newCat) return;

  if (!siteCategories.includes(newCat)) {
    siteCategories.push(newCat);
    localStorage.setItem('shubham_categories', JSON.stringify(siteCategories));
    showToast(`Category added!`);
  } else {
    showToast(`Category already exists`);
  }

  document.getElementById('addCategoryForm').reset();
  renderAdminCategories();
}
function checkAdminAccess() {
  if (!currentUser || currentUser.phone !== ADMIN_PHONE) {
    showToast("Access Denied");
    setTimeout(() => window.location.href = "index.html", 1000);
  } else {
    document.getElementById('adminNavLinks').style.display = 'flex';
  }
}

async function ensurePdfJsForAdmin() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return true;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return true;
  }
  return false;
}

async function generatePreviewImagesFromPdf(file, pageLimit = 3) {
  if (!file) return [];
  const ok = await ensurePdfJsForAdmin();
  if (!ok) return [];
  const buffer = await file.arrayBuffer();
  const pdfDoc = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const maxPages = Math.min(pageLimit, pdfDoc.numPages);
  const images = [];
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    // Compress and resize the extracted image to max 1200x1200
    const MAX_WIDTH = 1200;
    const MAX_HEIGHT = 1200;
    let width = canvas.width;
    let height = canvas.height;
    
    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
      if (width > height) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      } else {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }
      const compressedCanvas = document.createElement('canvas');
      compressedCanvas.width = width;
      compressedCanvas.height = height;
      const compressedCtx = compressedCanvas.getContext('2d');
      compressedCtx.drawImage(canvas, 0, 0, width, height);
      images.push(compressedCanvas.toDataURL('image/jpeg', 0.8));
    } else {
      images.push(canvas.toDataURL('image/jpeg', 0.8));
    }
  }
  return images;
}

async function handleAddProduct(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
    submitBtn.innerHTML = '<span class="btn-loader"></span><span>Uploading...</span>';
  }

  try {
    const name = document.getElementById('name').value;
    const price = parseFloat(document.getElementById('price').value);
    const rawOriginal = document.getElementById('originalPrice').value;
    const original_price = rawOriginal ? parseFloat(rawOriginal) : null;
    const category = document.getElementById('category').value;
    
    const examCheckboxes = document.querySelectorAll('input[name="exam_opts"]:checked');
    const examValues = Array.from(examCheckboxes).map(cb => cb.value);
    const exam = examValues.length > 0 ? examValues.join(', ') : null;
    
    let imgUrl = document.getElementById('img').value;
    const pdfPreviewInput = document.getElementById('bookPdfPreview');
    const previewPdfFile = pdfPreviewInput && pdfPreviewInput.files ? pdfPreviewInput.files[0] : null;

    window.compressImage = function (file) {
      return new Promise((resolve) => {
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = () => resolve(null);
          img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    };

    const readImage = async (input) => {
      if (input && input.files && input.files[0]) {
        return await window.compressImage(input.files[0]);
      }
      return null;
    };

    const images = await Promise.all([
      readImage(document.getElementById('imgUpload1')),
      readImage(document.getElementById('imgUpload2')),
      readImage(document.getElementById('imgUpload3'))
    ]);

    let finalImages = images.filter(Boolean);
    if (finalImages.length === 0) {
      if (imgUrl) {
        finalImages = [imgUrl];
      } else if (previewPdfFile) {
        finalImages = await generatePreviewImagesFromPdf(previewPdfFile, 3);
        if (finalImages.length) {
          showToast('Created 3 preview images from PDF.');
        }
      }
      if (finalImages.length === 0) {
        finalImages = ["https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80"];
      }
    }

    const finalImg = finalImages.join('|');

    const addNode = async (imageSrc) => {
      const payload = { name, price, category, img: imageSrc };
      if (original_price) payload.original_price = original_price;
      if (exam) payload.exam = exam;
      try {
        await apiFetch("/admin/products", { method: "POST", body: payload });
        showToast("Product added successfully!");
      } catch (err) {
        showToast(err.message || "Failed to add product");
        console.error(err);
        return;
      }
      e.target.reset();
      if (document.getElementById('adminProductsList')) await renderAdminList();
    };

    await addNode(finalImg);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      submitBtn.textContent = submitBtn.dataset.originalText || 'Add Product';
    }
  }
}

async function removeProduct(id, name) {
  const shouldDelete = await showConfirmDialog(`Are you sure you want to delete "${name || 'this book'}"?`, 'Delete Book');
  if (!shouldDelete) return;
  
  showGlobalLoader(true, name ? `Say bye bye to ${name} 👋` : 'Deleting...');
  try {
    await apiFetch(`/admin/products/${id}`, { method: "DELETE" });
  } catch (err) {
    showGlobalLoader(false);
    showToast(err.message || "Delete failed");
    return;
  }
  await renderAdminList();
  showGlobalLoader(false);
}

async function renderAdminList() {
  const container = document.getElementById('adminProductsList');
  if (container) {
    container.innerHTML = '<div style="padding: 60px; text-align: center;"><div class="loader" style="width:40px; height:40px; border:4px solid var(--border-color); border-top-color:var(--primary); border-radius:50%; animation:spin 1s linear infinite; margin: 0 auto;"></div><div style="margin-top: 16px; color: var(--text-muted); font-weight: 600;">Waking up server and loading products...<br><span style="font-size:0.85rem; font-weight:normal;">(This may take up to 5 seconds)</span></div></div>';
    
    const minLoadTime = new Promise(resolve => setTimeout(resolve, 5000));
    let success = false;
    
    try {
      const res = await apiFetch("/admin/products", { method: "GET" });
      products = (res && res.products) || [];
      success = true;
    } catch (err) {
      // might fail immediately if server is asleep
    }
    
    await minLoadTime;
    
    if (!success) {
      try {
        const res = await apiFetch("/admin/products", { method: "GET" });
        products = (res && res.products) || [];
        success = true;
      } catch (err) {
        products = [];
        showToast(err.message || "Failed to load products");
      }
    }
    
    if (products.length === 0) {
      container.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">No products found.</div>';
      return;
    }

    container.innerHTML = products.map(p => `
      <div class="admin-list-item">
        <div style="display:flex; gap:12px; align-items:center;">
          <img src="${(p.img && p.img.split('|')[0]) || ''}" style="width:40px; height:40px; border-radius:4px; object-fit:cover;">
          <div>
            <strong>${p.name}</strong> <br>
            <span style="color: var(--text-muted); font-size: 0.85rem;">${p.category} | ${formatPrice(p.price)}</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openEditModal(${p.id})">Edit</button>
          <button class="remove-btn" onclick="removeProduct(${p.id}, '${p.name ? p.name.replace(/'/g, "\\'") : ''}')">Delete</button>
        </div>
      </div>
    `).join('');
  }
}

async function renderAdminUsers() {
  const userContainer = document.getElementById('adminUsersList');
  if (userContainer) {
    let dbUsers = [];
    try {
      const res = await apiFetch("/admin/users", { method: "GET" });
      dbUsers = (res && res.users) || [];
    } catch (err) {
      dbUsers = [];
      showToast(err.message || "Failed to load users");
    }
    if (dbUsers.length === 0) {
      userContainer.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">No users found. Wait for users to register.</div>';
    } else {
      userContainer.innerHTML = dbUsers.map(u => `
        <div class="admin-list-item">
          <div><strong>${u.name}</strong> <span style="font-size:0.8rem; background:var(--bg-color); padding:2px 6px; border-radius:4px;">${u.role}</span></div>
          <div style="color:var(--text-muted);">${u.phone}</div>
          <button class="remove-btn" onclick="deleteUser('${u.phone}')" ${u.phone === ADMIN_PHONE ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}>Delete</button>
        </div>
      `).join('');
    }
  }
}

window.deleteUser = async function (phone) {
  if (phone === ADMIN_PHONE) {
    showToast("Admin user cannot be deleted.");
    return;
  }
  const shouldDelete = await showConfirmDialog('Are you sure you want to delete this user?', 'Delete User');
  if (!shouldDelete) return;
  try {
    await apiFetch(`/admin/users/${encodeURIComponent(phone)}`, { method: "DELETE" });
  } catch (err) {
    showToast(err.message || "Error deleting user");
    return;
  }
  showToast("User deleted.");
  await renderAdminUsers();
};

// Edit Modal Logic
window.openEditModal = function (id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  document.getElementById('editProductId').value = product.id;
  document.getElementById('editName').value = product.name;
  document.getElementById('editPrice').value = product.price;
  document.getElementById('editOriginalPrice').value = product.original_price || '';
  document.getElementById('editCategory').value = product.category;
  
  const examBoxes = document.querySelectorAll('input[name="edit_exam_opts"]');
  examBoxes.forEach(cb => cb.checked = false);
  if (product.exam) {
    const pExams = product.exam.split(',').map(e => e.trim());
    examBoxes.forEach(cb => {
      if (pExams.includes(cb.value)) cb.checked = true;
    });
  }
  
  document.getElementById('editImg').value = product.img;

  const modal = document.getElementById('editProductModal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditModal = function () {
  const modal = document.getElementById('editProductModal');
  if (modal) modal.style.display = 'none';
};

async function handleEditProduct(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
    submitBtn.innerHTML = '<span class="btn-loader"></span><span>Saving...</span>';
  }
  const id = parseInt(document.getElementById('editProductId').value);
  const name = document.getElementById('editName').value;
  const price = parseFloat(document.getElementById('editPrice').value);
  const rawOriginal = document.getElementById('editOriginalPrice').value;
  const original_price = rawOriginal ? parseFloat(rawOriginal) : null;
  const category = document.getElementById('editCategory').value;
  
  const examCheckboxes = document.querySelectorAll('input[name="edit_exam_opts"]:checked');
  const examValues = Array.from(examCheckboxes).map(cb => cb.value);
  const exam = examValues.length > 0 ? examValues.join(', ') : null;
  
  let imgUrl = document.getElementById('editImg').value;
  const fileInput = document.getElementById('editImgUpload');
  const editPdfPreviewInput = document.getElementById('editBookPdfPreview');
  const editPreviewPdfFile = editPdfPreviewInput && editPdfPreviewInput.files ? editPdfPreviewInput.files[0] : null;

  const updateNode = async (imageSrc) => {
    let finalImg = imageSrc;
    if (!finalImg && editPreviewPdfFile) {
      const generated = await generatePreviewImagesFromPdf(editPreviewPdfFile, 3);
      if (generated && generated.length > 0) {
        finalImg = generated.join('|');
        showToast('Created 3 preview images from PDF.');
      }
    }
    finalImg = finalImg || "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80";
    
    const payload = { name, price, category, img: finalImg, original_price: original_price || null };
    if (exam) payload.exam = exam;
    try {
      await apiFetch(`/admin/products/${id}`, { method: "PUT", body: payload });
      showToast("Product updated successfully!");
      closeEditModal();
      await renderAdminList();
    } catch (err) {
      showToast(err.message || "Update failed");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        submitBtn.textContent = submitBtn.dataset.originalText || 'Save Changes';
      }
    }
  };

  if (fileInput.files && fileInput.files[0]) {
    const compressed = await window.compressImage(fileInput.files[0]);
    updateNode(compressed);
  } else {
    updateNode(imgUrl);
  }
}


function getTrimmedInputValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

async function renderAdminOrders(useCache = false) {
  const container = document.getElementById('adminOrdersList');
  if (!container) return;

  const countLabel = document.getElementById('adminOrdersCountLabel');
  let dbOrders = [];
  if (useCache && Array.isArray(window._adminOrdersRaw)) {
    dbOrders = window._adminOrdersRaw;
  } else {
    try {
      const res = await apiFetch("/admin/orders?order_type=books", { method: "GET" });
      dbOrders = (res && res.orders) || [];
    } catch (err) {
      dbOrders = [];
      showToast(err.message || "Failed to load orders");
    }
    window._adminOrdersRaw = dbOrders;
  }

  if (countLabel) {
    countLabel.textContent = 'Total book orders: ' + dbOrders.length;
  }

  if (dbOrders.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No orders yet.</div>`;
    return;
  }

  window.ordersListContext = dbOrders;

  const q = getTrimmedInputValue('adminOrdersSearch').toLowerCase();

  // Filter out any orders that are ONLY PDFs
  const physicalOrders = dbOrders.filter(o => {
    if (!o.items || !Array.isArray(o.items)) return true; // Assume physical if unknown
    // Check if there is at least one physical 'book' item
    let hasPhysical = false;
    o.items.forEach(item => {
      if (item.type !== 'note') hasPhysical = true;
    });
    return hasPhysical;
  });

  if (physicalOrders.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No book orders yet.</div>`;
    return;
  }

  const filteredOrders = q ? physicalOrders.filter(o => String(o.id || '').toLowerCase().includes(q)) : physicalOrders;
  if (!filteredOrders.length) {
    container.innerHTML = `<div style="padding: 24px; color: var(--text-muted); text-align:center;">No orders match this Order ID.</div>`;
    return;
  }

  const activeOrders = filteredOrders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return'));
  const completedOrders = filteredOrders.filter(o => o.status === 'Delivered' || o.status === 'Cancelled' || String(o.status || '').includes('Return'));

  const renderList = (list) => {
    if (!list.length) return `<div style="padding: 12px; color: var(--text-muted);">No orders in this category.</div>`;
    return list.map(o => {
      const statusClass = `status-${String(o.status || 'Pending').toLowerCase()}`;
      return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <strong style="font-size: 1.1rem;">${o.id}</strong><br>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${o.date}</span>
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            ${o.status === 'Cancelled' ? `<span style="background:#ff3b3020; color:#ff3b30; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">Cancelled</span>` : `<span style="background:var(--bg-color); color:var(--text-main); border:1px solid var(--border-color); padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">${o.status || 'Pending'}</span>`}
            
            ${(o.status !== 'Delivered' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return')) ? `<button onclick="updateOrderStatus('${o.id}', 'Delivered')" style="background:#10b98115; color:#10b981; border:1px solid #10b98140; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#10b98125'" onmouseout="this.style.background='#10b98115'">Mark Delivered</button>` : ''}
            
            <button onclick="deleteOrder('${o.id}')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#ff3b3025'" onmouseout="this.style.background='#ff3b3015'">Delete</button>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div>
            <strong>Customer Details</strong>
            <p style="font-size: 0.9rem; margin-top: 4px;">${o.customer} (${o.customerphone})</p>
            <p style="font-size: 0.9rem; color: var(--text-muted);">${o.address}</p>
          </div>
          <div>
            <strong>Payment Info</strong>
            <p style="font-size: 0.9rem; margin-top: 4px;">Method: ${o.method}</p>
            <p style="font-size: 0.9rem; font-weight: 700;">Total: ${formatPrice(o.total)}</p>
          </div>
        </div>

        <div style="background: var(--bg-color); border-radius: var(--radius-sm); padding: 12px;">
          <strong style="display:block; margin-bottom: 8px;">Order Items</strong>
          ${normalizeOrderItems(o.items).map(i => `<div style="font-size: 0.9rem; display:flex; justify-content:space-between;"><span>${i.name} (x${i.quantity})</span> <span>${formatPrice(i.price * i.quantity)}</span></div>`).join('')}
        </div>
      </div>
      `;
    }).join('');
  };

  container.innerHTML = `
    <div style="background:var(--primary); color:#fff; padding:12px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; font-size:1.15rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Active Orders
    </div>
    <div style="background:rgba(0,0,0, 0.02); border:1px solid var(--border-color); border-top:none; border-radius:0 0 var(--radius-md) var(--radius-md); padding:20px; margin-bottom:32px; box-shadow:var(--shadow-sm);">
      ${renderList(activeOrders)}
    </div>
    <div style="background:#10b981; color:#fff; padding:12px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; font-size:1.15rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Completed & Cancelled
    </div>
    <div style="background:rgba(16,185,129,0.02); border:1px solid var(--border-color); border-top:none; border-radius:0 0 var(--radius-md) var(--radius-md); padding:20px; box-shadow:var(--shadow-sm);">
      ${renderList(completedOrders)}
    </div>
  `;
}

async function renderAdminReturns(useCache = false) {
  const container = document.getElementById('adminReturnsList');
  if (!container) return;

  let merged = [];
  if (useCache && Array.isArray(window._adminReturnsMerged)) {
    merged = window._adminReturnsMerged;
  } else {
    let dbOrders = [];
    let dbCopies = [];
    try {
      const booksRes = await apiFetch("/admin/orders?order_type=books", { method: "GET" });
      const copyRes = await apiFetch("/admin/orders?order_type=photocopy", { method: "GET" });
      dbOrders = ((booksRes && booksRes.orders) || []).filter(o => o.status === "Return Requested");
      dbCopies = ((copyRes && copyRes.orders) || []).filter(o => o.status === "Return Requested");
    } catch (err) {
      dbOrders = [];
      dbCopies = [];
      showToast(err.message || "Failed to load returns");
    }

    merged = [
      ...dbOrders.map((o) => ({ kind: 'book', o, t: getBookOrderPlacedAtMs(o) })),
      ...dbCopies.map((o) => ({ kind: 'photocopy', o, t: getPhotocopyPlacedAtMs(o) }))
    ].sort((a, b) => b.t - a.t);
    window._adminReturnsMerged = merged;
  }

  const q = getTrimmedInputValue('adminReturnsSearch').toLowerCase();
  const filtered = q ? merged.filter(({ o }) => String(o.id || '').toLowerCase().includes(q)) : merged;

  const countLabel = document.getElementById('adminReturnsCountLabel');
  if (countLabel) countLabel.textContent = 'Total returned orders: ' + merged.length;

  if (merged.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No returned orders.</div>`;
    return;
  }
  if (!filtered.length) {
    container.innerHTML = `<div style="padding: 24px; color: var(--text-muted); text-align:center;">No returns match this Order ID.</div>`;
    return;
  }

  container.innerHTML = filtered.map(({ kind, o }) => {
    return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--primary);">${kind === 'book' ? 'Books' : 'Photocopy'}</span>
            <strong style="display:block; margin-top:4px; font-size: 1.1rem;">${o.id}</strong>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${o.date || new Date(o.created_at).toLocaleString('en-IN')}</span>
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span style="background:#ff980020; color:#ff9800; border:1px solid #ff980040; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">Return Requested</span>
            <button onclick="handleReturnAction('${o.id}', '${kind === 'book' ? 'orders' : 'photocopy_orders'}', 'Return Accepted')" style="background:#10b98115; color:#10b981; border:1px solid #10b98140; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#10b98125'" onmouseout="this.style.background='#10b98115'">Accept</button>
            <button onclick="handleReturnAction('${o.id}', '${kind === 'book' ? 'orders' : 'photocopy_orders'}', 'Return Rejected')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#ff3b3025'" onmouseout="this.style.background='#ff3b3015'">Reject</button>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div>
            <strong>Customer Details</strong>
            <p style="font-size: 0.9rem; margin-top: 4px;">${o.customer !== undefined ? o.customer : 'User'} (${o.customerphone || o.customer_phone})</p>
            <p style="font-size: 0.9rem; color: var(--text-muted);">${o.address || ''}</p>
          </div>
          <div>
            <strong>Total Amount</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; font-weight: 700;">${formatPrice(o.total || o.total_cost || 0)}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteOrder = async function (orderId) {
  if (!confirm('Delete this order? This cannot be undone.')) return;
  showGlobalLoader(true, `Say bye bye to ${orderId} 👋`);
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=books`, { method: "DELETE" });
  } catch (err) {
    showGlobalLoader(false);
    showToast(err.message || "Delete failed");
    return;
  }
  showToast('Order deleted.');
  await renderAdminOrders();
  showGlobalLoader(false);
};

window.updateOrderStatus = async function (orderId, newStatus) {
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=books`, { method: "PATCH", body: { status: newStatus } });
  } catch (err) {
    showToast(err.message || "Update failed");
    return;
  }
  await renderAdminOrders();
};

window.handleReturnAction = async function (orderId, table, action) {
  if (!confirm(`Are you sure you want to ${action === 'Return Accepted' ? 'Accept' : 'Reject'} this return?`)) return;
  const orderType = table === "orders" ? "books" : "photocopy";
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=${orderType}`, { method: "PATCH", body: { status: action } });
  } catch (err) {
    showToast(err.message || "Action failed");
    return;
  }
  showToast(action);
  await renderAdminReturns();
};

window.returnUserOrder = async function (orderId, type) {
  if (!confirm("Are you sure you want to return this order?")) return;
  const table = type === 'book' ? 'orders' : 'photocopy_orders';
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from(table).update({ status: 'Return Requested' }).eq('id', orderId);
    } catch (e) { console.error('Return error:', e); }
  } else {
    try {
      let local = JSON.parse(localStorage.getItem(table) || '[]');
      local = local.map(o => o.id === orderId ? { ...o, status: 'Return Requested' } : o);
      localStorage.setItem(table, JSON.stringify(local));
    } catch (e) { }
  }
  showToast("Return Requested");
  await renderMyOrders();
};

window.cancelUserOrder = async function (orderId, type) {
  if (!confirm("Are you sure you want to cancel this order?")) return;
  const table = type === 'book' ? 'orders' : 'photocopy_orders';
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from(table).update({ status: 'Cancelled' }).eq('id', orderId);
    } catch (e) { console.error('Cancel error:', e); }
  } else {
    try {
      let local = JSON.parse(localStorage.getItem(table) || '[]');
      local = local.map(o => o.id === orderId ? { ...o, status: 'Cancelled' } : o);
      localStorage.setItem(table, JSON.stringify(local));
    } catch (e) { }
  }
  showToast("Order Cancelled");
  await renderMyOrders();
};

async function renderMyOrders() {
  const container = document.getElementById('myOrdersList');
  if (!container) return;

  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  let dbOrders = [];
  let photoOrders = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data: books } = await supabase.from('orders').select('*').eq('customerphone', currentUser.phone).order('date', { ascending: false });
    dbOrders = books || [];
    const { data: copies } = await supabase
      .from('photocopy_orders')
      .select('*')
      .eq('customer_phone', currentUser.phone)
      .order('created_at', { ascending: false });
    photoOrders = copies || [];
  } else {
    try {
      dbOrders = JSON.parse(localStorage.getItem('orders') || '[]').filter(o => o.customerphone === currentUser.phone);
      photoOrders = JSON.parse(localStorage.getItem('photocopy_orders') || '[]').filter(o => o.customer_phone === currentUser.phone);
    } catch (e) { }
  }

  const merged = [
    ...dbOrders.map((o) => ({ kind: 'book', o, t: getBookOrderPlacedAtMs(o) })),
    ...photoOrders.map((o) => ({ kind: 'photocopy', o, t: getPhotocopyPlacedAtMs(o) }))
  ].sort((a, b) => b.t - a.t);

  if (merged.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted);">You have not placed any orders yet.</div>`;
    return;
  }

  container.innerHTML = merged.map(({ kind, o }) => {
    if (kind === 'book') {
      const steps = computeBookTrackingCompletedSteps(o);
      const statusClass = `status-${String(o.status || 'pending').toLowerCase()}`;
      const timeline = buildOrderTrackingTimelineHTML(steps, {
        hint: 'Progress updates about every 12 hours over 2 days. When we ship, status jumps ahead automatically.'
      }, o);
      return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 24px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--primary);">Books</span>
            <strong style="font-size: 1.1rem; display:block; margin-top:4px;">${o.id}</strong>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${o.date || ''}</span>
          </div>
          <div style="text-align: right;">
            ${String(o.status || 'Pending').trim() === 'Cancelled' ? `<span style="color: #ff3b30; font-weight: bold; font-size: 0.9rem;">Cancelled</span>`
          : String(o.status || 'Pending').trim() === 'Return Requested' ? `<span style="color: #ff9800; font-weight: bold; font-size: 0.9rem;">Return Requested</span>`
            : String(o.status || 'Pending').trim() === 'Return Accepted' ? `<span style="color: #10b981; font-weight: bold; font-size: 0.9rem;">Return Accepted</span>`
              : String(o.status || 'Pending').trim() === 'Return Rejected' ? `<span style="color: #ff3b30; font-weight: bold; font-size: 0.9rem;">Return Rejected</span>`
                : String(o.status || 'Pending').trim() === 'Delivered' ? (Date.now() - getBookOrderPlacedAtMs(o) < 5 * 24 * 60 * 60 * 1000 ? `<button onclick="returnUserOrder('${o.id}', 'book')" style="background:#ff980015; color:#ff9800; border:1px solid #ff980040; padding:6px 14px; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Return Order</button>` : `<span style="color:var(--text-muted); font-size:0.85rem;">Return Window Expired</span>`)
                  : (computeBookTrackingCompletedSteps(o) < 2 ? `<button onclick="cancelUserOrder('${o.id}', 'book')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:6px 14px; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Cancel Order</button>` : `<span style="color: #10b981; font-weight: 600; font-size: 0.9rem;">Processing</span>`)}
          </div>
        </div>

        ${timeline}

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; margin-bottom: 20px;">
          <div>
            <strong>Delivery Address</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-muted);">${o.address || ''}</p>
          </div>
          <div>
            <strong>Payment Info</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-muted);">Method: ${o.method || ''}</p>
            <p style="font-size: 0.9rem; font-weight: 700;">Total: ${formatPrice(o.total)}</p>
          </div>
        </div>

        <div style="background: var(--bg-color); border-radius: var(--radius-sm); padding: 12px;">
          <strong style="display:block; margin-bottom: 8px;">Order Items</strong>
          ${normalizeOrderItems(o.items).map(i => `<div style="font-size: 0.9rem; display:flex; justify-content:space-between; color: var(--text-main);"><span>${i.name} (x${i.quantity})</span> <span>${formatPrice(i.price * i.quantity)}</span></div>`).join('')}
        </div>
      </div>`;
    }

    const steps = computePhotocopyTrackingCompletedSteps(o);
    const st = o.status || 'Pending';
    const timeline = buildOrderTrackingTimelineHTML(steps, {
      hint: 'Photocopy progress updates over about 48 hours. Shop status (Processing / Ready) can move you forward faster.'
    }, o);
    const when = o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : '';
    return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 24px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--primary);">Photocopy</span>
            <strong style="font-size: 1.1rem; display:block; margin-top:4px;">${o.id}</strong>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${when}</span>
          </div>
          <div style="text-align: right;">
            ${st === 'Cancelled' ? `<span style="color: #ff3b30; font-weight: bold; font-size: 0.9rem;">Cancelled</span>`
        : (st === 'Delivered' || st === 'Completed') ? `<span style="color: #10b981; font-weight: bold; font-size: 0.9rem;">${st}</span>`
          : (computePhotocopyTrackingCompletedSteps(o) < 2 ? `<button onclick="cancelUserOrder('${o.id}', 'photocopy_orders')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:6px 14px; border-radius:6px; font-size:0.85rem; font-weight:600; cursor:pointer;">Cancel Order</button>` : `<span style="color: #10b981; font-weight: 600; font-size: 0.9rem;">Processing</span>`)}
          </div>
        </div>

        ${timeline}

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
          <div>
            <strong>Address</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-muted);">${o.address || ''}</p>
          </div>
          <div>
            <strong>Total</strong>
            <p style="font-size: 0.9rem; font-weight: 700; margin-top: 4px;">${formatPrice(Number(o.total_cost))}</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">${o.pages || 0} pages × ${o.copies || 1} copy</p>
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderCheckoutSummary() {
  const container = document.getElementById('checkoutSummaryItems');
  if (!container) return;

  container.innerHTML = cart.map(item => `
    <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.9rem;">
      <div style="color:var(--text-main); font-weight:500; display:flex; gap:8px;">
        <span style="color:var(--text-muted);">x${item.quantity}</span>
        ${item.name}
      </div>
      <span>${formatPrice(item.price * item.quantity)}</span>
    </div>
  `).join('');

  const rawSubtotal = getCartTotal();
  document.getElementById('checkoutSubtotal').textContent = formatPrice(rawSubtotal);
  document.getElementById('checkoutTotal').textContent = formatPrice(rawSubtotal + DELIVERY_FEE);
}

async function renderTopSellingBooks() {
  const container = document.getElementById('topSellingBooks');
  if (!container) return;

  const supabase = getSupabase();
  if (!supabase) {
    container.innerHTML = '<p style="padding:20px;color:var(--text-muted);margin:0;">Connect Supabase to see bestselling books.</p>';
    return;
  }

  const { data: orders, error } = await supabase.from('orders').select('items');
  if (error) {
    container.innerHTML = '<p style="padding:20px;color:var(--text-muted);margin:0;">Could not load sales data.</p>';
    return;
  }

  const qtyByKey = new Map();
  (orders || []).forEach((o) => {
    normalizeOrderItems(o.items).forEach((i) => {
      const name = (i.name || 'Book').trim() || 'Book';
      const key = i.id != null && i.id !== '' ? String(i.id) : name;
      const q = Number(i.quantity) || 0;
      const prev = qtyByKey.get(key) || { name, qty: 0 };
      prev.qty += q;
      prev.name = name;
      qtyByKey.set(key, prev);
    });
  });

  const ranked = [...qtyByKey.values()].sort((a, b) => b.qty - a.qty).slice(0, 3);
  if (!ranked.length) {
    container.innerHTML = '<p style="padding:20px;color:var(--text-muted);margin:0;">No book orders yet — stats will appear after customers buy books.</p>';
    return;
  }

  container.innerHTML = `<ol style="margin:0;padding-left:22px;line-height:1.75;color:var(--text-main);">
    ${ranked.map((r, idx) => `<li style="margin-bottom:10px;"><strong>${idx + 1}. ${r.name}</strong> <span style="color:var(--text-muted);font-weight:500;">— ${r.qty} units sold</span></li>`).join('')}
  </ol>`;
}

// Excel CSV Exporter
window.exportOrdersToCSV = async function (filterType = 'all') {
  const supabase = getSupabase();
  if (!supabase) return alert("Database not connected!");

  try {
    let stdFilter = '*';
    let photoFilter = '*';

    const { data: stdOrders } = await supabase.from('orders').select(stdFilter);
    const { data: photoOrders } = await supabase.from('photocopy_orders').select(photoFilter);

    let csvRows = [];
    csvRows.push(['Order ID', 'Type', 'Customer Name', 'Phone No.', 'Items/Details', 'Total (Rs)', 'Status', 'Date', 'Time']);

    if (stdOrders) {
      stdOrders.forEach(o => {
        let isPending = o.status !== 'Delivered' && o.status !== 'Cancelled' && o.status !== 'Returned';
        if (filterType === 'pending' && !isPending) return;
        if (filterType === 'completed' && o.status !== 'Delivered') return;

        let type = 'Book';
        let itemsStr = '';
        if (o.items && Array.isArray(o.items)) {
          o.items.forEach(i => {
            if (i.type === 'note') type = 'PDF';
            itemsStr += (i.name || 'Item') + ' (x' + (i.quantity || 1) + ') | ';
          });
        }
        const cDate = o.created_at || o.date || new Date().toISOString();
        const dObj = new Date(cDate);
        const dateStr = !isNaN(dObj.getTime()) ? dObj.toLocaleDateString() : '';
        const timeStr = !isNaN(dObj.getTime()) ? dObj.toLocaleTimeString() : '';

        csvRows.push([
          o.id || '',
          type,
          `"${String(o.customer || 'Unknown').replace(/"/g, '""')}"`,
          o.customerphone || '',
          `"${String(itemsStr || '').replace(/"/g, '""')}"`,
          o.total || 0,
          o.status || '',
          dateStr,
          timeStr
        ]);
      });
    }

    if (photoOrders) {
      photoOrders.forEach(po => {
        let isPending = po.status !== 'Completed' && po.status !== 'Delivered' && po.status !== 'Cancelled' && po.status !== 'Returned';
        if (filterType === 'pending' && !isPending) return;
        if (filterType === 'completed' && po.status !== 'Completed' && po.status !== 'Delivered') return;

        const cDate = po.created_at || new Date().toISOString();
        const dObj = new Date(cDate);
        const dateStr = !isNaN(dObj.getTime()) ? dObj.toLocaleDateString() : '';
        const timeStr = !isNaN(dObj.getTime()) ? dObj.toLocaleTimeString() : '';

        csvRows.push([
          po.id || '',
          'Photocopy',
          `"${String(po.customer_name || po.customer || 'Unknown').replace(/"/g, '""')}"`,
          po.phone || po.customerphone || '',
          `"${String(po.details || 'Photocopy Doc').replace(/"/g, '""')}"`,
          po.total_cost || po.total || 0,
          po.status || '',
          dateStr,
          timeStr
        ]);
      });
    }

    let fName = "All";
    if (filterType === 'pending') fName = "Pending";
    if (filterType === 'completed') fName = "Completed";
    const dateStringForFile = new Date().toLocaleDateString('en-GB').split('/').join('-');
    const fileName = `Shubham_Xerox_${fName}_Orders_${dateStringForFile}.xlsx`;

    if (typeof XLSX !== 'undefined') {
      const worksheet = XLSX.utils.aoa_to_sheet(csvRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
      XLSX.writeFile(workbook, fileName);
    } else {
      // Fallback to CSV if library failed to load
      let csvContent = csvRows.map(row => row.join(',')).join('\n');
      let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      let link = document.createElement("a");
      if (link.download !== undefined) {
        let url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName.replace('.xlsx', '.csv'));
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  } catch (e) {
    console.error("Export error", e);
    alert("Failed to export data.");
  }
};

window.renderPaidPDFLog = function (pdfOrders) {
  const container = document.getElementById('paidPdfOrdersList');
  if (!container) return;
  if (!pdfOrders || pdfOrders.length === 0) {
    container.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">No PDF purchases yet.</div>';
    return;
  }

  window._adminPaidPdfOrders = pdfOrders;
  const q = getTrimmedInputValue('adminPdfOrdersSearch').toLowerCase();
  const filtered = q ? pdfOrders.filter(o => String(o.id || '').toLowerCase().includes(q)) : pdfOrders;
  if (!filtered.length) {
    container.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">No PDF orders match this Order ID.</div>';
    return;
  }

  // Sort descending by date
  filtered.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

  container.innerHTML = filtered.map(o => {
    let pdfNames = '';
    if (o.items && Array.isArray(o.items)) {
      pdfNames = o.items.filter(i => i.type === 'note').map(i => i.name).join(', ');
    }
    const d = new Date(o.created_at || o.date);
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:16px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:12px;">
      <div style="display: flex; gap: 16px; align-items: center;">
        <div style="background: rgba(128,42,126,0.1); color: var(--primary); width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem;">
          ${(o.customer || 'U').charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-weight:600; color:var(--text-main); margin-bottom:2px; font-size:1.05rem;">${o.customer} <span style="font-size:0.85rem; color:var(--text-muted); font-weight:normal; margin-left:8px;">${o.customerphone}</span></div>
          <div style="font-size:0.9rem; color:var(--text-main);">Bought: <strong style="color:var(--primary);">${pdfNames}</strong></div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight:700; color:#10b981; font-size:1.1rem;">₹${o.total}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>`;
  }).join('');
};

async function renderAdminDashboard() {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: standardOrders } = await supabase.from('orders').select('*');
      const { data: photocopyOrders } = await supabase.from('photocopy_orders').select('*');

      let totalRevenue = 0;
      let pendingRevenue = 0;
      let deliveredBooks = 0;
      let paidPdfsSold = 0;
      let pdfOrders = [];

      if (standardOrders) {
        standardOrders.forEach(o => {
          let hasPdf = false;
          let hasBook = false;
          if (o.items && Array.isArray(o.items)) {
            o.items.forEach(item => {
              if (item.type === 'note') hasPdf = true;
              else hasBook = true;
            });
          }
          if (hasPdf) {
            paidPdfsSold++;
            totalRevenue += Number(o.total) || 0;
            pdfOrders.push(o);
          } else if (hasBook) {
            if (o.status === 'Delivered') {
              totalRevenue += Number(o.total) || 0;
              deliveredBooks++;
            } else if (o.status !== 'Cancelled' && o.status !== 'Returned') {
              pendingRevenue += Number(o.total) || 0;
            }
          } else {
            if (o.status === 'Delivered') {
              totalRevenue += Number(o.total) || 0;
              deliveredBooks++;
            } else if (o.status !== 'Cancelled' && o.status !== 'Returned') {
              pendingRevenue += Number(o.total) || 0;
            }
          }
        });
      }

      if (photocopyOrders) {
        photocopyOrders.forEach(po => {
          if (po.status === 'Completed' || po.status === 'Delivered') {
            totalRevenue += Number(po.total_cost || po.total) || 0;
          } else if (po.status !== 'Cancelled' && po.status !== 'Returned') {
            pendingRevenue += Number(po.total_cost || po.total) || 0;
          }
        });
      }

      const revEl = document.getElementById('statRevenue');
      const penEl = document.getElementById('statPendingRevenue');
      const pdfEl = document.getElementById('statPdfSold');
      const bkEl = document.getElementById('statDeliveredBooks');

      if (revEl) revEl.innerText = '₹' + Math.floor(totalRevenue).toLocaleString('en-IN');
      if (penEl) penEl.innerText = '₹' + Math.floor(pendingRevenue).toLocaleString('en-IN');
      if (pdfEl) pdfEl.innerText = String(paidPdfsSold);
      if (bkEl) bkEl.innerText = String(deliveredBooks);

      renderPaidPDFLog(pdfOrders);

    } catch (e) {
      console.warn('Error fetching dashboard stats:', e);
    }
  }

  await renderTopSellingBooks();

  const ctx = document.getElementById('visitsChart');
  if (ctx && window.Chart) {
    // Generate dates for the last 7 days
    const last7Days = [];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }

    let chartData = new Array(7).fill(0);
    let totalVisits = 0;

    if (supabase) {
      const { data: visits } = await supabase.from('site_visits').select('created_at');
      if (visits) {
        totalVisits = visits.length;
        visits.forEach(v => {
          const vDate = v.created_at.split('T')[0];
          const idx = last7Days.indexOf(vDate);
          if (idx !== -1) {
            chartData[idx]++;
          }
        });
      }
    }

    if (document.getElementById('statVisitors')) {
      document.getElementById('statVisitors').innerText = totalVisits;
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#333' : '#e0e0e0';
    const gridColor = isLight ? '#ddd' : '#333';

    window.adminChartObj = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'People Count',
          data: chartData,
          backgroundColor: '#802a7e',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor } }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false } },
          y: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false }, beginAtZero: true }
        }
      }
    });
  }
}

// Slider
let currentSlide = 0;
let slideInterval;

function initSlider() {
  const slides = document.querySelectorAll('.slide');
  const dots = document.querySelectorAll('.dot');
  if (slides.length === 0) return;

  function setSlide(index) {
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    currentSlide = index;
  }
  window.goToSlide = (index) => {
    setSlide(index);
    resetInterval();
  };
  function nextSlide() {
    let next = (currentSlide + 1) % slides.length;
    setSlide(next);
  }
  function resetInterval() {
    clearInterval(slideInterval);
    slideInterval = setInterval(nextSlide, 4000);
  }
  resetInterval();
}

async function renderReviews(productId) {
  const container = document.getElementById('existingReviews');
  if (!container) return;
  let revs = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase.from('reviews').select('*').eq('product_id', productId).order('created_at', { ascending: false });
    if (data) revs = data;
  }
  if (!revs || revs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">No reviews yet. Be the first to review!</p>';
    return;
  }
  container.innerHTML = revs.map(r => `
    <div style="background:var(--bg-color); padding:16px; border-radius:8px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <strong style="color:var(--primary);">${r.user_name}</strong>
        <span style="color:#ffc107;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
      </div>
      <p style="margin:0; font-size:0.95rem; color:#444;">${r.review_text}</p>
    </div>
  `).join('');
}


// --- Main Bootstrap ---
document.addEventListener('DOMContentLoaded', async () => {
  // --- Global Loader Injection ---
  const globalLoader = document.createElement('div');
  globalLoader.id = 'shubham-global-loader';
  globalLoader.innerHTML = `
    <div style="position: fixed; inset: 0; background: var(--bg-main, #111113); z-index: 999999; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: opacity 0.4s ease;">
      <div style="width: 48px; height: 48px; border: 4px solid rgba(255, 255, 255, 0.1); border-top-color: var(--primary, #007aff); border-radius: 50%; animation: s-spin 1s linear infinite; margin-bottom: 20px;"></div>
      <div style="color: var(--text-muted); font-size: 0.95rem; font-weight: 600; font-family: 'Inter', sans-serif; letter-spacing: 0.5px;">Please wait...</div>
      <style>@keyframes s-spin { 100% { transform: rotate(360deg); } }</style>
    </div>
  `;
  document.body.appendChild(globalLoader);

  // --- Click toggle for nav dropdowns ---
  document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dropdown = e.target.closest('.nav-dropdown');
      dropdown.classList.toggle('is-open');
      document.querySelectorAll('.nav-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('is-open');
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('is-open'));
    }
  });

  // --- Log Visit ---
  const todayDate = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('shubham_last_visit') !== todayDate) {
    const supabase = getSupabase();
    if (supabase) {
      supabase.from('site_visits').insert({}).then(({ error }) => {
        if (!error) {
          localStorage.setItem('shubham_last_visit', todayDate);
        }
      });
    }
  }

  // Inject Theme Toggle Switch into Navbar
  const navIcons = document.querySelector('.nav-icons');
  if (navIcons) {
    const themeSwitchWrapper = document.createElement('div');
    themeSwitchWrapper.className = 'theme-switch-wrapper';

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    themeSwitchWrapper.innerHTML = `
      <span class="theme-switch-label" id="themeLabel">${isLight ? 'LIGHT' : 'DARK'}</span>
      <label class="theme-switch">
        <input type="checkbox" id="themeToggleCheckbox" ${isLight ? 'checked' : ''}>
        <span class="theme-slider"></span>
      </label>
    `;
    navIcons.appendChild(themeSwitchWrapper);

    const checkbox = themeSwitchWrapper.querySelector('#themeToggleCheckbox');
    const label = themeSwitchWrapper.querySelector('#themeLabel');

    checkbox.addEventListener('change', (e) => {
      const root = document.documentElement;
      let textColor = '#e0e0e0';
      let gridColor = '#333';

      if (e.target.checked) {
        root.setAttribute('data-theme', 'light');
        localStorage.setItem('shubham_theme', 'light');
        label.innerText = 'LIGHT';
        textColor = '#333';
        gridColor = '#ddd';
      } else {
        root.removeAttribute('data-theme');
        localStorage.setItem('shubham_theme', 'dark');
        label.innerText = 'DARK';
      }

      // Update Chart Colors if present
      if (window.adminChartObj) {
        window.adminChartObj.options.plugins.legend.labels.color = textColor;
        window.adminChartObj.options.scales.x.ticks.color = textColor;
        window.adminChartObj.options.scales.x.grid.color = gridColor;
        window.adminChartObj.options.scales.y.ticks.color = textColor;
        window.adminChartObj.options.scales.y.grid.color = gridColor;
        window.adminChartObj.update();
      }
    });
  }

  updateCartBadge();
  updateNavForUser();
  initSlider();

  // Handle mobile nav dropdown toggle
  document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      trigger.parentElement.classList.toggle('mobile-open');
    });
  });

  // Attach priority listeners BEFORE blocking network fetches
  if (document.getElementById('loginForm')) document.getElementById('loginForm').addEventListener('submit', handleLogin);
  if (document.getElementById('registerForm')) document.getElementById('registerForm').addEventListener('submit', handleRegister);
  if (document.getElementById('forgotPasswordForm')) document.getElementById('forgotPasswordForm').addEventListener('submit', handleForgotPassword);

  const forgotToggleBtn = document.getElementById('forgotToggleBtn');
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  if (forgotToggleBtn && forgotPasswordForm) {
    forgotToggleBtn.addEventListener('click', () => {
      const isHidden = forgotPasswordForm.style.display === 'none';
      forgotPasswordForm.style.display = isHidden ? 'block' : 'none';
    });
  }

  if (document.getElementById('checkoutForm')) {
    if (!currentUser) { showToast("Please login first."); setTimeout(() => window.location.href = "login.html", 1500); }
    renderCheckoutSummary();
    if (currentUser) {
      document.getElementById('fullName').value = currentUser.name || "";
      const d = getSavedDeliveryDetails();
      const ad = document.getElementById('address');
      const ct = document.getElementById('city');
      const pc = document.getElementById('pincode');
      if (ad && d.street) ad.value = d.street;
      if (ct && d.city) ct.value = d.city;
      if (pc && d.pincode) pc.value = d.pincode;
    }
    document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);
  }

  window.requestRegisterOTP = requestRegisterOTP;
  window.requestForgotPasswordOTP = requestForgotPasswordOTP;

  // Fetch in background without blocking rendering
  let fetchPromise = fetchProducts().catch(e => console.error("fetchProducts error", e));

  if (document.getElementById('featuredProducts')) renderProductsGrid('featuredProducts', 4);

  if (document.getElementById('allProductsContainer')) {
    selectedCategories = parseProductsCategoryParams();

    try {
      renderMultiSelect();
    } catch (e) {
      console.error("renderMultiSelect error:", e);
    }
    renderProductsGrid('allProductsContainer', null, selectedCategories);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderProductsGrid('allProductsContainer', null, selectedCategories);
        if (typeof renderFilteredFreeNotes === 'function') renderFilteredFreeNotes();
      });
    }

    // Close multi-select when clicking outside
    document.addEventListener('click', (e) => {
      const container = document.getElementById('categoryMultiSelect');
      if (container && !container.contains(e.target)) {
        const dropdown = document.getElementById('multiSelectDropdown');
        if (dropdown) dropdown.classList.remove('active');
      }
    });
  }

  if (document.getElementById('cartItems')) renderCart();

  const path = window.location.pathname;

  if (path.includes('admin.html') || path.endsWith('/admin')) {
    checkAdminAccess();
    await renderAdminDashboard();
    await renderAdminUsers();
  }

  if (path.includes('admin-add')) {
    checkAdminAccess();
    if (document.getElementById('adminForm')) {
      document.getElementById('adminForm').addEventListener('submit', handleAddProduct);
    }
    if (document.getElementById('addCategoryForm')) {
      document.getElementById('addCategoryForm').addEventListener('submit', handleAddCategory);
      renderAdminCategories();
    }
  }

  if (path.includes('admin-products')) {
    checkAdminAccess();

    const editForm = document.getElementById('editProductForm');
    if (editForm) {
      editForm.addEventListener('submit', handleEditProduct);
    }

    renderAdminCategories();
    await renderAdminList();
  }

  if (path.includes('admin-orders')) {
    checkAdminAccess();
    await renderAdminOrders();
  }

  if (path.includes('admin-photocopy')) {
    checkAdminAccess();
  }

  if (path.includes('admin') || path.includes('admin-photocopy')) {
    const pricingForm = document.getElementById('pricingForm');
    if (pricingForm) {
      const currentRates = getCeRates();
      document.getElementById('bwRateInput').value = currentRates.bw;
      document.getElementById('colorRateInput').value = currentRates.color;
      pricingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const bw = Number(parseFloat(document.getElementById('bwRateInput').value).toFixed(2));
        const color = Number(parseFloat(document.getElementById('colorRateInput').value).toFixed(2));
        localStorage.setItem('shubham_ce_rates', JSON.stringify({ bw, color }));
        showToast('Pricing settings saved!');
      });
    }
  }

  if (path.includes('admin-returns')) {
    checkAdminAccess();
    await renderAdminReturns();
  }

  if (path.includes('my-orders')) {
    if (!currentUser) {
      window.location.href = "login.html";
      return;
    }
    await renderMyOrders();
  }

  const detailContainer = document.getElementById('productDetailContainer');
  if (detailContainer) {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));
    let product = products.find(p => p.id === productId);

    if (!product && typeof fetchPromise !== 'undefined') {
      detailContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading product...</div>';
      await fetchPromise;
      product = products.find(p => p.id === productId);
    }

    if (product) {
      window.buyNow = function (pid) { addToCart(pid); window.location.href = "checkout.html"; };
      const pDesc = product.desc || `Premium quality ${product.category.toLowerCase()} available for you at Shubham Xerox. Perfect for your exam preparation with clear printing and accurate content.`;

      const imgs = product.img ? product.img.split('|') : ["https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80"];
      let imgGalleryHtml = '';
      if (imgs.length > 1) {
        imgGalleryHtml = `
          <div class="product-slider-container" style="position:relative; width:100%;">
            <div class="product-slider-main">
              <img id="mainProductImg" src="${imgs[0]}" alt="${product.name}" style="width: 100%; border-radius: var(--radius-md); object-fit: cover;">
            </div>
            <div class="product-slider-thumbs" style="display:flex; gap:10px; margin-top:15px; overflow-x:auto;">
              ${imgs.map((src, i) => `
                <img src="${src.trim()}" onclick="document.getElementById('mainProductImg').src='${src.trim()}'; document.querySelectorAll('.product-slider-thumbs img').forEach(el=>el.style.borderColor='transparent'); this.style.borderColor='var(--primary)';" style="width:80px; height:80px; object-fit:cover; border-radius:8px; cursor:pointer; border: 2px solid ${i === 0 ? 'var(--primary)' : 'transparent'};">
              `).join('')}
            </div>
          </div>
        `;
      } else {
        imgGalleryHtml = `<img src="${imgs[0]}" alt="${product.name}" style="width: 100%; border-radius: var(--radius-md); object-fit: cover;">`;
      }

      // The inner HTML is identical to what the user had, minus the dynamic DB load loop which we do via JS functions.
      detailContainer.innerHTML = `
        <div class="product-detail-layout">
          <div class="product-detail-img-card">
            ${imgGalleryHtml}
          </div>
          <div>
            <div class="category-tag" style="margin-bottom: 16px; font-size: 0.95rem; color: #802a7e;">${product.category}</div>
            <h1 style="font-size: 2.2rem; margin-bottom: 12px; font-weight: 800; letter-spacing: -0.02em; color: var(--text-main);">${product.name}</h1>
            <div style="margin-bottom: 24px;">
               ${(() => {
          if (product.original_price && product.original_price > product.price) {
            const disc = Math.round(((product.original_price - product.price) / product.original_price) * 100);
            return `<span style="font-size: 2.2rem; font-weight: 700; color: var(--text-main);">${formatPrice(product.price)}</span>
                           <span style="font-size: 1.4rem; color: var(--text-muted); text-decoration: line-through; margin-left: 12px; font-weight: 500;">${formatPrice(product.original_price)}</span>
                           <span style="font-size: 1.2rem; color: #00a676; margin-left: 12px; font-weight: 700;">${disc}% Off</span>`;
          }
          return `<span style="font-size: 2.2rem; font-weight: 700; color: var(--text-main);">${formatPrice(product.price)}</span>`;
        })()}
            </div>
            
            <div style="background: rgba(128, 42, 126, 0.1); border-left: 4px solid #802a7e; padding: 16px; margin-bottom: 32px; border-radius: 8px;">
              <p style="font-weight: 600; font-size: 1.05rem; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; color: var(--text-main);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#802a7e" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Delivered in 3-5 Days
              </p>
              <p style="color: var(--text-muted); font-size: 0.95rem;">Flat delivery charge ₹70 on all orders.</p>
            </div>

            <div style="margin-bottom: 40px;">
              <h3 style="font-size: 1.5rem; margin-bottom: 16px;">Book Description</h3>
              <p style="color: var(--text-muted); font-size: 1.1rem; line-height: 1.8;">${pDesc}</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 40px;">
              <button class="btn btn-outline-purple" style="width: 100%; padding: 16px; font-size: 1.1rem;" onclick="addToCart(${product.id})">
                Add To Cart
              </button>
              <button class="btn btn-purple" style="width: 100%; padding: 16px; font-size: 1.1rem;" onclick="buyNow(${product.id})">
                Buy Now
              </button>
            </div>

            <div class="features-row">
              <div class="feature-item">
                <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg></div>
                <span>Secure Payments</span>
              </div>
              <div class="feature-item">
                <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></div>
                <span>Assured Quality</span>
              </div>
              <div class="feature-item">
                <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></div>
                <span>Made In India</span>
              </div>
              <div class="feature-item">
                <div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg></div>
                <span>Timely Delivery</span>
              </div>
            </div>

            <!-- Reviews Section -->
            <div id="reviewsSection" style="margin-top: 60px; border-top: 1px solid var(--border-color); padding-top: 40px;">
              <h3 style="font-size: 1.5rem; margin-bottom: 24px; color: var(--text-main);">Customer Reviews</h3>
              <div id="existingReviews" style="margin-bottom: 40px;"></div>
              <h4 style="font-size: 1.2rem; margin-bottom: 16px;">Write a Review</h4>
              <form id="reviewForm" style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                  <label for="rating" style="font-weight: 600; margin-bottom: 8px; display: block; color: var(--text-main);">Tap to Rate:</label>
                  <div id="starRatingContainer" style="display: flex; gap: 4px; font-size: 2rem; cursor: pointer; color: #ccc;">
                    <span class="star" data-value="1">★</span>
                    <span class="star" data-value="2">★</span>
                    <span class="star" data-value="3">★</span>
                    <span class="star" data-value="4">★</span>
                    <span class="star" data-value="5">★</span>
                  </div>
                  <input type="hidden" id="rating" value="5">
                </div>
                <div>
                  <label for="reviewText" style="font-weight: 600; margin-bottom: 8px; display: block; color: var(--text-main);">Your Review:</label>
                  <textarea id="reviewText" placeholder="Share your experience with this book..." required style="padding: 12px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); border-radius: 4px; width: 100%; min-height: 100px; resize: vertical;"></textarea>
                </div>
                <button type="submit" class="btn btn-purple" style="align-self: flex-start;">Submit Review</button>
              </form>
            </div>
          </div>
        </div>
      `;

      // Initialize reviews right away on page load
      await renderReviews(productId);

      const stars = document.querySelectorAll('#starRatingContainer .star');
      const ratingInput = document.getElementById('rating');
      stars.forEach(star => {
        star.addEventListener('click', () => {
          let val = parseInt(star.getAttribute('data-value'));
          ratingInput.value = val;
          stars.forEach(s => {
            if (parseInt(s.getAttribute('data-value')) <= val) {
              s.style.color = '#ffc107';
            } else {
              s.style.color = '#ccc';
            }
          });
        });
      });
      // Initial 5 star select
      if (stars.length > 4) stars[4].click();

      document.getElementById('reviewForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) { showToast("Login required to review"); setTimeout(() => window.location.href = "login.html", 1500); return; }
        const rVal = document.getElementById('rating').value;
        const tVal = document.getElementById('reviewText').value;
        const supabase = getSupabase();
        if (supabase) {
          const { error } = await supabase.from('reviews').insert({
            product_id: productId,
            user_name: currentUser.name || "Anonymous",
            rating: parseInt(rVal),
            review_text: tVal
          });
          if (error) {
            console.error("Supabase Error on Review Submit:", error);
            showToast("Failed to submit: " + (error.message || "Network Error"));
            return;
          }
        } else {
          const newReview = {
            user: currentUser.name || "Anonymous",
            rating: parseInt(rVal),
            text: tVal,
            date: new Date().toLocaleDateString()
          };
          if (!reviews[productId]) reviews[productId] = [];
          reviews[productId].push(newReview);
          localStorage.setItem('shubham_reviews', JSON.stringify(reviews));
        }
        document.getElementById('reviewForm').reset();
        await renderReviews(productId);
        showToast("Review submitted successfully!");
      });
    } else {
      detailContainer.innerHTML = '<div style="text-align: center; font-size: 1.2rem;">Product not found. <a href="products.html">Browse all products</a></div>';
    }
  }

  // --- Loader Teardown ---
  // A minimum viable delay protects against visual flicker if cache hits instantly
  setTimeout(() => {
    const loader = document.getElementById('shubham-global-loader');
    if (loader) {
      loader.firstElementChild.style.opacity = '0';
      setTimeout(() => loader.remove(), 400);
    }
  }, 250);

});

// --- Reviews Functions ---
async function renderReviews(productId) {
  const existingReviewsDiv = document.getElementById('existingReviews');
  if (!existingReviewsDiv) return;

  let productReviews = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('reviews').select('*').eq('product_id', productId);
    if (!error) productReviews = data || [];
  } else {
    productReviews = reviews[productId] || [];
  }

  existingReviewsDiv.innerHTML = productReviews.map(review => `
    <div style="border-bottom: 1px solid #eee; padding: 20px 0; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-weight: 600;">${review.user_name || review.user}</span>
        <span style="color: #ffa500;">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
      </div>
      <p style="color: #555; line-height: 1.6;">${review.review_text || review.text}</p>
      <small style="color: #888;">${review.created_at ? new Date(review.created_at).toLocaleDateString() : review.date}</small>
    </div>
  `).join('') || '<p style="color: #888;">No reviews yet. Be the first to review!</p>';
}

// ==========================================
// --- Real-time Chat System ---
// ==========================================

function checkChatLogin() {
  if (!currentUser) {
    showToast("Login required to start chat");
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
  } else {
    window.location.href = "chat.html";
  }
}

// User Chat Init
let chatSubscription = null;
let currentChatUserId = null;

async function initUserChat() {
  if (!currentUser) return;
  currentChatUserId = currentUser.phone;
  await loadMessages(currentChatUserId, 'chatMessagesArea');
  subscribeToMessages(currentChatUserId, 'chatMessagesArea');
}

// Admin Chat Center Init
async function initAdminChatCenter() {
  await fetchAdminChatUsers();
  // Listen for new messages globally to update sidebar
  const supabase = getSupabase();
  if (supabase) {
    supabase.channel('admin_global_msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        // Refresh user list to bubble up active chats
        fetchAdminChatUsers();
        // If we are currently viewing this user's chat, append message
        if (currentChatUserId && (payload.new.sender === currentChatUserId || payload.new.receiver === currentChatUserId)) {
          appendMessageToUI(payload.new, 'adminMessagesContainer', true);
        }
      })
      .subscribe();
  }
}

async function fetchAdminChatUsers() {
  const container = document.getElementById('adminChatUsersList');
  if (!container) return;

  const supabase = getSupabase();
  if (!supabase) return;

  // Fetch messages to get unique users who have chatted
  const { data: messages } = await supabase.from('messages').select('sender, receiver, created_at').order('created_at', { ascending: false });
  if (!messages) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No messages yet.</div>';
    return;
  }

  const userPhones = new Set();
  messages.forEach(m => {
    if (m.sender !== ADMIN_PHONE) userPhones.add(m.sender);
    if (m.receiver !== ADMIN_PHONE) userPhones.add(m.receiver);
  });

  if (userPhones.size === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No active chats.</div>';
    return;
  }

  // Fetch user details
  const { data: users } = await supabase.from('users').select('name, phone').in('phone', Array.from(userPhones));
  const { data: orders } = await supabase.from('orders').select('customerphone');

  const usersMap = {};
  users?.forEach(u => usersMap[u.phone] = u.name);

  const orderCount = {};
  orders?.forEach(o => {
    if (!orderCount[o.customerphone]) orderCount[o.customerphone] = 0;
    orderCount[o.customerphone]++;
  });

  // Array from Set is not naturally ordered by recent message without extra logic, 
  // but keeping it simple for now or sorting by messages.
  const phoneArray = Array.from(userPhones);

  container.innerHTML = phoneArray.map(phone => {
    const name = usersMap[phone] || 'Unknown User';
    const ordersItem = orderCount[phone] || 0;
    const isActive = phone === currentChatUserId ? 'active' : '';
    return `
      <div class="admin-user-item ${isActive}" onclick="openAdminChatForUser('${phone}')">
        <div class="admin-user-item-avatar">${name.charAt(0).toUpperCase()}</div>
        <div style="flex:1;">
          <div style="font-weight:600; color:var(--text-main);">${name}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${phone}</div>
        </div>
        <div style="font-size:0.75rem; background:var(--primary); color:#fff; padding:2px 6px; border-radius:12px;">${ordersItem} orders</div>
      </div>
    `;
  }).join('');
}

async function openAdminChatForUser(phone) {
  currentChatUserId = phone;
  // Update sidebar active state visually
  fetchAdminChatUsers();

  const mainArea = document.getElementById('adminChatMainArea');
  const user = await getUserNameByPhone(phone);

  // Render chat frame
  mainArea.innerHTML = `
    <header class="chat-header">
      <div class="chat-header-info">
        <div class="chat-avatar">
           <img src="images/logo.png" alt="Avatar" style="width:40px; height:40px; border-radius:50%; object-fit:cover; background:#fff; border: 1px solid var(--border-color);">
        </div>
        <div>
          <h2 style="font-size: 1.1rem; margin: 0; color: #fff;">${user} <span style="font-size:0.8rem; font-weight:400; opacity:0.8;">(${phone})</span></h2>
        </div>
      </div>
      <button onclick="deleteEntireChat('${phone}')" style="color:#ff3b30; background:rgba(255,59,48,0.1); padding:6px 12px; border-radius:4px; font-size:0.8rem; font-weight:600;">Delete Chat</button>
    </header>
    <main class="chat-messages" id="adminMessagesContainer" style="flex:1; overflow-y:auto; padding:20px;"></main>
    <footer class="chat-input-container">
      <input type="file" id="adminChatFileInput" accept="application/pdf" style="display: none;">
      <button class="chat-attach-btn" onclick="document.getElementById('adminChatFileInput').click();" aria-label="Attach File">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
      </button>
      <div class="chat-input-wrapper">
        <div id="adminChatFilePreview" class="chat-file-preview" style="display:none;">
          <span id="adminChatFileName" style="font-size:0.8rem; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></span>
          <button onclick="clearAdminChatFilePreview()" style="color:#ff3b30; background:transparent; border:none; cursor:pointer; font-size:1.2rem;">&times;</button>
        </div>
        <input type="text" id="adminChatInputMessage" class="chat-input" placeholder="Type a reply..." autocomplete="off">
      </div>
      <button class="chat-send-btn" onclick="handleSendChatMessage('admin')" aria-label="Send Message">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    </footer>
  `;

  await loadMessages(phone, 'adminMessagesContainer', true);
}

async function getUserNameByPhone(phone) {
  const supabase = getSupabase();
  if (!supabase) return "User";
  const { data } = await supabase.from('users').select('name').eq('phone', phone).single();
  return data ? data.name : "User";
}

// Shared Message Loading & Rendering
async function loadMessages(chatPhoneId, containerId, isAdminPanel = false) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: messages } = await supabase.from('messages')
    .select('*')
    .or(`and(sender.eq.${chatPhoneId},receiver.eq.${ADMIN_PHONE}),and(sender.eq.${ADMIN_PHONE},receiver.eq.${chatPhoneId})`)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  const container = document.getElementById(containerId);
  if (!container) return;

  if (messages && messages.length > 0) {
    container.innerHTML = '';
    messages.forEach(msg => appendMessageToUI(msg, containerId, isAdminPanel));
  } else {
    // Keep empty state if user, clear if admin
    if (!isAdminPanel && document.getElementById('chatEmptyState')) {
      document.getElementById('chatEmptyState').style.display = 'flex';
      container.innerHTML = '';
      container.appendChild(document.getElementById('chatEmptyState'));
    } else {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:20px;" class="chat-placeholder-empty">No messages. Send a message to start!</div>';
    }
  }
}

function subscribeToMessages(chatPhoneId, containerId) {
  const supabase = getSupabase();
  if (!supabase) return;

  if (chatSubscription) supabase.removeChannel(chatSubscription);

  chatSubscription = supabase.channel('user_chat_updates')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new;
      if (!msg.is_deleted && ((msg.sender === chatPhoneId && msg.receiver === ADMIN_PHONE) || (msg.sender === ADMIN_PHONE && msg.receiver === chatPhoneId))) {
        appendMessageToUI(msg, containerId, false);
      }
    })
    .subscribe();
}

function appendMessageToUI(msg, containerId, isAdminPanel) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (msg.id && document.getElementById(`msg-${msg.id}`)) return;
  const emptyState = container.querySelector('.chat-empty-state');
  if (emptyState) emptyState.style.display = 'none';

  const placeholderInfo = container.querySelector('.chat-placeholder-empty');
  if (placeholderInfo) placeholderInfo.remove();

  const isMe = isAdminPanel ? (msg.sender === ADMIN_PHONE) : (msg.sender !== ADMIN_PHONE);
  const bubbleClass = isMe ? 'chat-bubble-me' : 'chat-bubble-other';

  // Safe date parsing 
  const d = new Date(msg.created_at);
  const timeInfo = isNaN(d) ? 'Now' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let contentHtml = '';
  if (msg.message) {
    contentHtml += `<div class="chat-text">${msg.message}</div>`;
  }
  if (msg.file_url) {
    const fileName = msg.file_url.split('/').pop().split('?')[0] || "document.pdf";
    contentHtml += `
      <div class="chat-file-attachment">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        <span class="file-name">${fileName}</span>
        <a href="${msg.file_url}" target="_blank" download class="file-download-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></a>
      </div>
    `;
  }

  const msgDiv = document.createElement('div');
  msgDiv.id = `msg-${msg.id || Date.now()}`;
  msgDiv.className = `chat-bubble-wrapper ${bubbleClass}`;
  msgDiv.innerHTML = `
    <div class="chat-bubble">
      ${contentHtml}
      <div class="chat-meta">
        ${timeInfo}
        ${isMe ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="read-receipt" style="color:var(--primary); margin-left:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </div>
    </div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// Sending Logic
async function handleSendChatMessage(mode) {
  const isUser = mode === 'user';
  const fileInputId = isUser ? 'chatFileInput' : 'adminChatFileInput';
  const textInputId = isUser ? 'chatInputMessage' : 'adminChatInputMessage';
  const previewClearFunc = isUser ? window.clearChatFilePreview : window.clearAdminChatFilePreview;

  const textInput = document.getElementById(textInputId);
  const fileInput = document.getElementById(fileInputId);

  if (!textInput) return; // defensive

  const msgText = textInput.value.trim();
  const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

  if (!msgText && !file) return; // Nothing to send

  const senderId = isUser ? currentUser.phone : ADMIN_PHONE;
  const receiverId = isUser ? ADMIN_PHONE : currentChatUserId;

  // Disable parsing while sending
  textInput.disabled = true;
  if (fileInput) fileInput.disabled = true;

  let uploadedFileUrl = null;

  if (file) {
    uploadedFileUrl = await uploadPdfToSupabase(file);
    if (!uploadedFileUrl) {
      showToast("File upload failed.");
      textInput.disabled = false;
      if (fileInput) fileInput.disabled = false;
      return;
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    const { error, data: insertedMsg } = await supabase.from('messages').insert({
      sender: senderId,
      receiver: receiverId,
      message: msgText || null,
      file_url: uploadedFileUrl
    }).select().single();
    if (error) {
      console.error("Failed to send message:", error);
      showToast("Failed to send message.");
    } else {
      // If it's admin, and the local real-time listener is slow, we can forcibly append it visually now or wait for the subscription. 
      // Admin already has real-time listner active that covers this, wait! For Admin, the listener triggers on 'admin_global_msgs', which adds it to 'adminMessagesContainer'. 
      // Same for user: user listener 'user_chat_updates' adds to 'chatMessagesArea'. 
      // Local state update makes it feel completely instant
      const containerId = isUser ? 'chatMessagesArea' : 'adminMessagesContainer';
      if (insertedMsg) {
        appendMessageToUI(insertedMsg, containerId, !isUser);
      }
    }
  }

  // Cleanup
  textInput.value = '';
  textInput.disabled = false;
  if (fileInput) {
    fileInput.value = '';
    fileInput.disabled = false;
  }
  if (previewClearFunc) previewClearFunc();
  textInput.focus();
}

async function uploadPdfToSupabase(file) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const { data, error } = await supabase.storage.from('chat-files').upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) {
    console.error("Storage upload error:", error);
    showToast("Storage Error: " + error.message);
    return null;
  }

  const { data: pubData } = supabase.storage.from('chat-files').getPublicUrl(fileName);
  return pubData.publicUrl;
}

// Delete Chat (Admin)
async function deleteEntireChat(phone) {
  if (!confirm("Are you sure you want to delete all messages for this user? This cannot be undone.")) return;
  const supabase = getSupabase();
  if (supabase) {
    // Soft delete
    await supabase.from('messages')
      .update({ is_deleted: true })
      .or(`and(sender.eq.${phone},receiver.eq.${ADMIN_PHONE}),and(sender.eq.${ADMIN_PHONE},receiver.eq.${phone})`);

    showToast("Chat deleted.");
    document.getElementById('adminChatMainArea').innerHTML = `
      <div class="admin-chat-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <h3 style="margin-top: 16px; font-size: 1.2rem;">Select a chat to view</h3>
      </div>
    `;
    fetchAdminChatUsers(); // refresh list
  }
}

// ==========================================
// --- Free Notes System ---
// ==========================================

let freeNotesData = [];

// Index Page loading
async function loadFreeNotes() {
  const container = document.getElementById('freeNotesContainer');
  if (!container) return; // not index page

  const supabase = getSupabase();
  if (!supabase) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Database connection failed.</div>';
    return;
  }

  const { data: notes } = await supabase.from('free_notes').select('*').order('created_at', { ascending: false });
  freeNotesData = notes || [];

  renderFilteredFreeNotes();
}

window.renderFilteredFreeNotes = function() {
  let filtered = freeNotesData;
  const urlParams = new URLSearchParams(window.location.search);
  const examFilter = urlParams.get('exam');
  const formatFilter = urlParams.get('format');
  const searchInput = document.getElementById('searchInput');

  const isProductsPage = window.location.pathname.includes('products.html');
  const hasSearchIntent = examFilter || formatFilter === 'pdf' || (searchInput && searchInput.value);

  if (isProductsPage && !hasSearchIntent) {
    const wrapper = document.getElementById('freeNotesSectionWrapper');
    if (wrapper) wrapper.style.display = 'none';
    return;
  }

  if (examFilter) {
    const originalExam = examFilter.toLowerCase();
    const qExams = originalExam.split(/[\s/]+/).filter(t => t);
    filtered = filtered.filter(p => {
      const titleL = (p.title || '').toLowerCase();
      return qExams.some(token => titleL.includes(token));
    });
  }

  if (searchInput && searchInput.value) {
    const spaceTokens = searchInput.value.toLowerCase().split(/\s+/).filter(t => t);
    filtered = filtered.filter(p => {
      const searchableStr = (p.title || '').toLowerCase();
      return spaceTokens.every(spaceToken => {
        const slashTokens = spaceToken.split('/').filter(t => t);
        return slashTokens.some(slashToken => searchableStr.includes(slashToken));
      });
    });
  }

  renderFreeNotesGrid(filtered);
};

function renderFreeNotesGrid(notesToDisplay) {
  const container = document.getElementById('freeNotesContainer');
  if (!container) return;
  
  const wrapper = document.getElementById('freeNotesSectionWrapper');
  if (wrapper) {
    wrapper.style.display = notesToDisplay.length > 0 ? 'block' : 'none';
  }

  if (notesToDisplay.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No free notes available yet. Check back soon!</div>';
    return;
  }

  const colors = [
    'var(--primary)',
    '#0f5866',
    '#1b4b6b',
    '#5b0f5b',
    '#e67e22'
  ];

  container.innerHTML = notesToDisplay.map((note, index) => {
    const bg = colors[index % colors.length];
    return `
    <div class="note-card" style="border: none; background: transparent; box-shadow: none; padding: 10px; display: flex; flex-direction: column; align-items: center; position: relative;">
      
      <!-- Prominent Badge Overlay -->
      <div style="position: absolute; top: 5px; right: 5px; background: ${note.is_paid ? 'var(--primary)' : '#10b981'}; color: ${note.is_paid ? '#000' : '#fff'}; padding: 4px 12px; font-size: 0.8rem; font-weight: 800; border-radius: 20px; z-index: 10; box-shadow: 0 4px 8px rgba(0,0,0,0.3); border: 2px solid var(--card-bg);">
        ${note.is_paid ? `PAID (₹${note.price})` : 'FREE'}
      </div>

      <div class="note-icon" id="pdf-icon-${note.id}" style="width: 160px; height: 160px; margin: 0 auto 20px; background: ${bg}; border-radius: 50%; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; border: 4px solid var(--card-bg); box-shadow: var(--shadow-md); position: relative; overflow: hidden;">
        <div class="fallback-ui" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; transition: opacity 0.3s; z-index: 1;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          <span style="font-size: 0.85rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">${note.is_paid ? 'PRO PDF' : 'FREE PDF'}</span>
        </div>
        <canvas id="pdf-canvas-${note.id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.5s; z-index: 2; pointer-events: none;"></canvas>
      </div>
      <div class="note-details" style="text-align: center; width: 100%;">
        <h3 class="note-title" style="font-size: 1.1rem; line-height: 1.4; margin-bottom: 4px;">${note.title}</h3>
        <p class="note-meta" style="margin-bottom: 16px;">${new Date(note.created_at).toLocaleDateString()}</p>
      </div>
      ${note.is_paid && !hasUnlockedNote(note.id) ? `
      <button onclick="openPdfViewer('${note.file_url}', ${note.price}, '${note.id}', '${note.title.replace(/'/g, "\\'")}')" class="btn note-download-btn" aria-label="Preview & Buy ${note.title}" style="border-radius: var(--radius-full); width: auto; padding: 10px 20px; font-size: 0.95rem; background: var(--primary); color: #000;">
        Preview & Buy (₹${note.price}) <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      </button>
      ` : `
      ${note.is_paid
        ? `<button onclick="openPdfViewer('${note.file_url}', ${note.price || 0}, '${note.id}', '${note.title.replace(/'/g, "\\'")}')" class="btn note-download-btn" aria-label="View ${note.title}" style="border-radius: var(--radius-full); width: auto; padding: 10px 20px; font-size: 0.95rem;">Open Secure Viewer <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 9h6v6H9z"></path></svg></button>`
        : `<a href="${note.file_url}" target="_blank" rel="noopener noreferrer" class="btn note-download-btn" aria-label="Open ${note.title}" style="border-radius: var(--radius-full); width: auto; padding: 10px 20px; font-size: 0.95rem;">Open PDF <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 9h6v6H9z"></path></svg></a>`
      }`}
    </div>
  `}).join('');

  setTimeout(() => loadPdfThumbnails(notesToDisplay), 100);
  setTimeout(updateFreeNotesNav, 120);
}

window.scrollFreeNotes = function (direction) {
  const slider = document.getElementById('freeNotesContainer');
  if (!slider) return;
  const card = slider.querySelector('.note-card');
  const jump = card ? (card.getBoundingClientRect().width + 24) : 300;
  slider.scrollBy({ left: direction === 'left' ? -jump : jump, behavior: 'smooth' });
  setTimeout(updateFreeNotesNav, 260);
};

function updateFreeNotesNav() {
  const slider = document.getElementById('freeNotesContainer');
  const prev = document.getElementById('freeNotesPrevBtn');
  const next = document.getElementById('freeNotesNextBtn');
  if (!slider || !prev || !next) return;
  const canScroll = slider.scrollWidth > slider.clientWidth + 2;
  prev.style.display = canScroll ? 'block' : 'none';
  next.style.display = canScroll ? 'block' : 'none';
  prev.style.opacity = slider.scrollLeft <= 4 ? '0.45' : '1';
  next.style.opacity = slider.scrollLeft + slider.clientWidth >= slider.scrollWidth - 4 ? '0.45' : '1';
}

async function loadPdfThumbnails(notes) {
  if (!window.pdfjsLib) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

  for (const note of notes) {
    if (!note.file_url) continue;
    try {
      const canvas = document.getElementById(`pdf-canvas-${note.id}`);
      const iconContainer = document.getElementById(`pdf-icon-${note.id}`);
      if (!canvas || !iconContainer) continue;

      const loadingTask = pdfjsLib.getDocument(note.file_url);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 1 });
      const scale = 160 / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const context = canvas.getContext('2d');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport
      };

      await page.render(renderContext).promise;
      canvas.style.opacity = '1';
      const fallback = iconContainer.querySelector('.fallback-ui');
      if (fallback) fallback.style.opacity = '0';
    } catch (err) {
      console.warn("Failed to load PDF thumbnail for note:", note.id, err);
    }
  }
}

window.filterFreeNotes = function () {
  const q = document.getElementById('freeNotesSearch').value.toLowerCase();
  const filtered = freeNotesData.filter(note => note.title.toLowerCase().includes(q));
  renderFreeNotesGrid(filtered);
};

// Admin Page logic
async function loadAdminFreeNotes() {
  const container = document.getElementById('adminFreeNotesList');
  if (!container) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const { data: notes } = await supabase.from('free_notes').select('*').order('created_at', { ascending: false });

  if (!notes || notes.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">No free notes uploaded yet.</div>';
    return;
  }

  container.innerHTML = notes.map(note => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:16px; border-radius:8px; border:1px solid var(--border-color);">
      <div>
        <div style="font-weight:600; color:var(--text-main); margin-bottom:4px;">
          ${note.title}
          ${note.is_paid ? `<span style="background:var(--primary); color:#000; font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-left:8px;">Paid (₹${note.price})</span>` : `<span style="background:#10b981; color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-left:8px;">Free</span>`}
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted);"><a href="${note.file_url}" target="_blank" style="color:var(--primary); text-decoration:underline;">View PDF</a> • Added: ${new Date(note.created_at).toLocaleDateString()}</div>
      </div>
      <button class="remove-btn" onclick="deleteFreeNote('${note.id}', '${note.title ? note.title.replace(/'/g, "\\'") : ''}')" style="padding:8px 16px;">Delete</button>
    </div>
  `).join('');
}

// Add note submit handler
const addFreeNoteForm = document.getElementById('addFreeNoteForm');
if (addFreeNoteForm) {
  addFreeNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('newNoteTitle');
    const fileInput = document.getElementById('newNoteFile');
    const typeInput = document.getElementById('newNoteType');
    const priceInput = document.getElementById('newNotePrice');
    const btn = document.getElementById('btnUploadNote');
    const btnText = document.getElementById('btnUploadNoteText');

    if (!titleInput.value || !fileInput.files.length) return;

    btn.disabled = true;
    btnText.textContent = 'Uploading...';

    const isPaid = typeInput && typeInput.value === 'paid';
    const price = isPaid && priceInput ? parseFloat(priceInput.value) || 0 : 0;

    const supabase = getSupabase();
    if (supabase) {
      const file = fileInput.files[0];
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

      const { error: uploadError } = await supabase.storage.from('free-notes').upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        showToast("Storage Error: " + uploadError.message);
      } else {
        const { data: pubData } = supabase.storage.from('free-notes').getPublicUrl(fileName);

        let payload = {
          title: titleInput.value,
          file_url: pubData.publicUrl,
          is_paid: isPaid,
          price: price
        };

        let { error: dbError } = await supabase.from('free_notes').insert(payload);

        if (dbError && dbError.message && dbError.message.includes('is_paid')) {
          delete payload.is_paid;
          delete payload.price;
          const retry = await supabase.from('free_notes').insert(payload);
          dbError = retry.error;
          if (!dbError) showToast("Note published! (Note: 'is_paid' missing in Supabase)");
        }

        if (dbError) {
          showToast("DB Error: " + dbError.message);
        } else {
          if (!dbError && !payload.is_paid) showToast("Note published!");
          addFreeNoteForm.reset();
          loadAdminFreeNotes(); // Refresh list automatically
        }
      }
    }

    btn.disabled = false;
    btnText.textContent = 'Upload Note';
  });
}

window.deleteFreeNote = async function (id, title) {
  const shouldDelete = await showConfirmDialog(`Are you sure you want to delete "${title || 'this note'}"?`, 'Delete Note');
  if (!shouldDelete) return;
  
  showGlobalLoader(true, title ? `Say bye bye to ${title} 👋` : 'Deleting...');
  const supabase = getSupabase();
  if (supabase) {
    try {
      // 1. Fetch note to get the file URL
      const { data: noteData } = await supabase.from('free_notes').select('file_url').eq('id', id).single();
      if (noteData && noteData.file_url) {
        // Extract the filename from the public URL
        const fileUrl = noteData.file_url;
        const parts = fileUrl.split('/');
        const fileName = parts[parts.length - 1];
        
        if (fileName) {
          // 2. Delete from Storage bucket
          await supabase.storage.from('free-notes').remove([fileName]);
        }
      }
    } catch (e) {
      console.warn("Could not delete PDF from storage:", e);
    }

    // 3. Delete from DB
    const { error } = await supabase.from('free_notes').delete().eq('id', id);
    if (error) showToast("Error deleting note.");
    else {
      showToast("Note deleted.");
      loadAdminFreeNotes();
    }
  }
  showGlobalLoader(false);
}

function showGlobalLoader(show, msg) {
  let loader = document.getElementById('globalFullscreenLoader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'globalFullscreenLoader';
    loader.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px;">
        <span class="spinner" style="width: 50px; height: 50px; border-width: 4px;"></span>
        <div id="globalLoaderText" style="color: white; font-size: 1.4rem; font-weight: 700; text-align: center; text-shadow: 0 2px 10px rgba(0,0,0,0.5);"></div>
      </div>
    `;
    loader.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 999999; display: flex; align-items: center; justify-content: center; transition: opacity 0.3s ease;';
    document.body.appendChild(loader);
  }
  
  const textEl = document.getElementById('globalLoaderText');
  if (textEl) {
    if (msg) {
      textEl.textContent = msg;
      textEl.style.display = 'block';
    } else {
      textEl.style.display = 'none';
    }
  }

  loader.style.display = show ? 'flex' : 'none';
}

// Hook them into DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (document.getElementById('freeNotesContainer')) {
      loadFreeNotes();
      const slider = document.getElementById('freeNotesContainer');
      if (slider) slider.addEventListener('scroll', updateFreeNotesNav, { passive: true });
      window.addEventListener('resize', updateFreeNotesNav);
    }
    if (document.getElementById('adminFreeNotesList') && currentUser && currentUser.phone === ADMIN_PHONE) {
      loadAdminFreeNotes();
    }
  }, 1000); // Give supabase a second to boot up
});

// --- Admin order search bindings ---
document.addEventListener('DOMContentLoaded', () => {
  const ordersSearch = document.getElementById('adminOrdersSearch');
  if (ordersSearch) {
    ordersSearch.addEventListener('input', () => renderAdminOrders(true));
  }
  const returnsSearch = document.getElementById('adminReturnsSearch');
  if (returnsSearch) {
    returnsSearch.addEventListener('input', () => renderAdminReturns(true));
  }
  const copySearch = document.getElementById('adminPhotocopySearch');
  if (copySearch) {
    copySearch.addEventListener('input', () => renderAdminPhotocopyOrders(true));
  }
  const pdfSearch = document.getElementById('adminPdfOrdersSearch');
  if (pdfSearch) {
    pdfSearch.addEventListener('input', () => {
      if (Array.isArray(window._adminPaidPdfOrders)) window.renderPaidPDFLog(window._adminPaidPdfOrders);
    });
  }
});

// ==========================================
//  COST ESTIMATOR
// ==========================================
let ceState = {
  pages: 0,
  manualPages: 0,
  printType: 'bw',    // 'bw' | 'color'
  copies: 1,
  sides: 'single',    // 'single' | 'double'
  paperSize: 'a4',
  payment: 'COD',
  deliveryMode: 'delivery',
  totalCost: 0,
  fileName: '',
  pdfFiles: []
};

function getCeRates() {
  try {
    return JSON.parse(localStorage.getItem('shubham_ce_rates')) || { bw: 1, color: 5 };
  } catch (e) {
    return { bw: 1, color: 5 };
  }
}

window.openCostEstimatorModal = function () {
  const modal = document.getElementById('costEstimatorModal');
  if (!modal) return;
  // Reset state
  ceResetState();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

window.closeCostEstimatorModal = function () {
  const modal = document.getElementById('costEstimatorModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  ceResetState();
};

function ceResetState() {
  ceState = { pages: 0, manualPages: 0, printType: 'bw', copies: 1, sides: 'single', paperSize: 'a4', payment: 'COD', totalCost: 0, fileName: '', pdfFiles: [] };
  // Reset UI
  const steps = ['ceStepEstimate', 'ceStepOrder', 'ceStepSuccess'];
  steps.forEach(s => { const el = document.getElementById(s); if (el) el.style.display = 'none'; });
  const est = document.getElementById('ceStepEstimate');
  if (est) est.style.display = 'block';

  const uploadZone = document.getElementById('ceUploadZone');
  if (uploadZone) uploadZone.classList.remove('has-file');
  const uploadText = document.getElementById('ceUploadText');
  if (uploadText) uploadText.textContent = 'Click to upload PDF';
  const pageInfo = document.getElementById('cePageInfo');
  if (pageInfo) pageInfo.style.display = 'none';
  const pdfInput = document.getElementById('cePdfInput');
  if (pdfInput) pdfInput.value = '';
  const manualPages = document.getElementById('ceManualPages');
  if (manualPages) manualPages.value = '';
  const copies = document.getElementById('ceCopiesVal');
  if (copies) copies.textContent = '1';
  const paperSize = document.getElementById('cePaperSize');
  if (paperSize) paperSize.value = 'a4';
  // Reset toggles
  ['ceBwBtn', 'ceColorBtn', 'ceSingleBtn', 'ceDoubleBtn', 'ceCodBtn', 'ceOnlineBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active');
  });
  const bwBtn = document.getElementById('ceBwBtn');
  if (bwBtn) bwBtn.classList.add('active');
  const singleBtn = document.getElementById('ceSingleBtn');
  if (singleBtn) singleBtn.classList.add('active');
  const codBtn = document.getElementById('ceCodBtn');
  if (codBtn) codBtn.classList.add('active');
  // Reset estimate display
  ['ceResPages', 'ceResCopies', 'ceResRate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '\u2013';
  });
  const total = document.getElementById('ceResTotal');
  if (total) total.textContent = 'Upload PDF first';
  const ceHint = document.getElementById('ceLoggedInHint');
  if (ceHint) {
    ceHint.style.display = 'none';
    ceHint.textContent = '';
  }
  // Reset form
  const form = document.getElementById('ceOrderForm');
  if (form) form.reset();
}

window.handleCePdfUpload = async function (input) {
  if (!input.files || !input.files.length) return;
  const files = Array.from(input.files).filter(f => String(f.type || '').includes('pdf'));
  if (!files.length) return;
  ceState.pdfFiles = files;
  ceState.fileName = files.length === 1 ? files[0].name : `${files.length} PDFs selected`;
  ceState.manualPages = 0;
  const manualInput = document.getElementById('ceManualPages');
  if (manualInput) manualInput.value = '';

  const uploadZone = document.getElementById('ceUploadZone');
  const uploadText = document.getElementById('ceUploadText');
  const pageInfo = document.getElementById('cePageInfo');

  uploadText.textContent = 'Counting pages...';
  uploadZone.classList.add('has-file');

  try {
    if (!window.pdfjsLib) {
      // Fallback if pdf.js not loaded yet
      showToast('PDF reader loading, try again in a moment.');
      uploadText.textContent = ceState.fileName;
      return;
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    let totalPages = 0;
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages += pdfDoc.numPages;
    }
    ceState.pages = totalPages;
    uploadText.textContent = files.length === 1 ? `\u2705 ${files[0].name}` : `\u2705 ${files.length} PDFs selected`;
    document.getElementById('cePageCount').textContent = ceState.pages;
    document.getElementById('ceFileName').textContent = ceState.fileName;
    pageInfo.style.display = 'flex';
    recalcEstimate();
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Could not read PDF. Try again.');
    uploadText.textContent = 'Click to upload PDF';
    uploadZone.classList.remove('has-file');
    ceState.pages = 0;
    ceState.fileName = '';
    ceState.pdfFiles = [];
  }
};

window.setCeManualPages = function (value) {
  const pages = parseInt(value, 10);
  ceState.manualPages = Number.isFinite(pages) && pages > 0 ? pages : 0;
  if (ceState.manualPages > 0) {
    ceState.pages = ceState.manualPages;
    ceState.fileName = 'Manual input';
    ceState.pdfFiles = [];
    const uploadZone = document.getElementById('ceUploadZone');
    const uploadText = document.getElementById('ceUploadText');
    const pageInfo = document.getElementById('cePageInfo');
    if (uploadZone) uploadZone.classList.remove('has-file');
    if (uploadText) uploadText.textContent = 'Using manual pages';
    if (pageInfo) pageInfo.style.display = 'flex';
    document.getElementById('cePageCount').textContent = ceState.pages;
    document.getElementById('ceFileName').textContent = 'Manual input';
  }
  recalcEstimate();
};

/* --- Scanner Camera Feature --- */
let scannerStream = null;
let scannerImages = [];

window.openScanner = async function () {
  if (!window.jspdf) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.body.appendChild(script);
  }
  scannerImages = [];
  document.getElementById('scannerBadge').textContent = `Scanned: 0`;
  document.getElementById('scannerModal').style.display = 'flex';
  document.getElementById('scannerFinishBtn').style.display = 'none';

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const scannerVideo = document.getElementById('scannerVideo');
    scannerVideo.srcObject = scannerStream;
    try { await scannerVideo.play(); } catch (e) { console.debug('Autoplay needed mute/interaction'); }
    resetScannerUI();
  } catch (err) {
    console.error("Camera error:", err);
    showToast("Camera access denied or unavailable.");
    closeScanner();
  }
};

window.closeScanner = function () {
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
  }
  document.getElementById('scannerModal').style.display = 'none';
};

function resetScannerUI() {
  document.getElementById('scannerVideo').style.display = 'block';
  document.getElementById('scannerPreviewContainer').style.display = 'none';
  document.getElementById('scannerCaptureBtn').style.display = 'flex';
  document.getElementById('scannerRetakeBtn').style.display = 'none';
  document.getElementById('scannerAcceptBtn').style.display = 'none';
}

window.captureScannerFrame = function () {
  const video = document.getElementById('scannerVideo');
  const canvas = document.getElementById('scannerPreviewCanvas');
  const ctx = canvas.getContext('2d');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Capture the full raw feed that the user framed
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Basic Enhancement (Grayscale & High Contrast)
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    let avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    avg = avg < 128 ? avg * 0.8 : avg * 1.2;
    if (avg > 255) avg = 255;
    data[i] = avg;
    data[i + 1] = avg;
    data[i + 2] = avg;
  }
  ctx.putImageData(imgData, 0, 0);

  document.getElementById('scannerVideo').style.display = 'none';
  document.getElementById('scannerPreviewContainer').style.display = 'flex';
  document.getElementById('scannerCaptureBtn').style.display = 'none';
  document.getElementById('scannerRetakeBtn').style.display = 'block';
  document.getElementById('scannerAcceptBtn').style.display = 'block';
};

window.retakeScannerFrame = function () {
  resetScannerUI();
};

window.acceptScannerFrame = function () {
  const canvas = document.getElementById('scannerPreviewCanvas');
  scannerImages.push(canvas.toDataURL('image/jpeg', 0.8));
  document.getElementById('scannerBadge').textContent = `Scanned: ${scannerImages.length}`;
  document.getElementById('scannerFinishBtn').style.display = 'block';
  resetScannerUI();
};

window.finishScanner = function () {
  if (scannerImages.length === 0) return;

  const jsPDF = window.jspdf.jsPDF;
  if (!jsPDF) {
    showToast("Wait for PDF lib to load...");
    return;
  }

  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const a4w = 210, a4h = 297;

  scannerImages.forEach((imgDataUrl, i) => {
    if (i > 0) doc.addPage();
    doc.addImage(imgDataUrl, 'JPEG', 0, 0, a4w, a4h);
  });

  const pdfBlob = doc.output('blob');
  ceState.pdfFiles = [new File([pdfBlob], "Scanned_Document.pdf", { type: "application/pdf" })];
  ceState.pages = scannerImages.length;
  ceState.manualPages = 0;

  document.getElementById('ceUploadText').textContent = `\u2705 Scanned_Document.pdf`;
  document.getElementById('ceUploadZone').classList.add('has-file');
  document.getElementById('cePageCount').textContent = ceState.pages;
  document.getElementById('ceFileName').textContent = "Scanned_Document.pdf";
  document.getElementById('cePageInfo').style.display = 'flex';

  closeScanner();
  recalcEstimate();
};

window.changeCopies = function (step) {
  const newVal = ceState.copies + step;
  if (newVal >= 1) {
    ceState.copies = newVal;
    recalcEstimate();
  }
};
window.setCePrintType = function (type) {
  ceState.printType = type;
  document.getElementById('ceBwBtn').classList.toggle('active', type === 'bw');
  document.getElementById('ceColorBtn').classList.toggle('active', type === 'color');
  recalcEstimate();
};

window.setCeSides = function (side) {
  ceState.sides = side;
  document.getElementById('ceSingleBtn').classList.toggle('active', side === 'single');
  document.getElementById('ceDoubleBtn').classList.toggle('active', side === 'double');
  recalcEstimate();
};

window.changeCopies = function (delta) {
  ceState.copies = Math.max(1, ceState.copies + delta);
  document.getElementById('ceCopiesVal').textContent = ceState.copies;
  recalcEstimate();
};

window.setCePayment = function (method) {
  ceState.payment = method;
  document.getElementById('ceCodBtn').classList.toggle('active', method === 'COD');
  document.getElementById('ceOnlineBtn').classList.toggle('active', method === 'Online');
};

window.setCeDelivery = function (mode) {
  ceState.deliveryMode = mode;
  document.getElementById('ceDeliveryBtn').classList.toggle('active', mode === 'delivery');
  document.getElementById('ceCollectBtn').classList.toggle('active', mode === 'collect');
  recalcEstimate();
};

window.recalcEstimate = function () {
  if (!ceState.pages) return;
  const paperSizeEl = document.getElementById('cePaperSize');
  if (paperSizeEl) ceState.paperSize = paperSizeEl.value;

  const rate = getCeRates()[ceState.printType];
  const billablePages = ceState.pages;
  let protoCost = billablePages * rate;
  if (ceState.sides === 'double') {
    protoCost = protoCost * 0.5;
  }
  ceState.totalCost = protoCost * ceState.copies;
  if (ceState.deliveryMode === 'delivery') {
    ceState.totalCost += DELIVERY_FEE;
  }

  document.getElementById('ceResPages').textContent = ceState.pages + (ceState.sides === 'double' ? ' pages (Double-Sided discounted)' : ' pages');
  document.getElementById('ceResCopies').textContent = ceState.copies;
  document.getElementById('ceResRate').textContent = `\u20B9${rate}/page (${ceState.printType === 'bw' ? 'B&W' : 'Colour'})`;

  let totalDesc = `\u20B9${ceState.totalCost.toFixed(2)}`;
  if (ceState.deliveryMode === 'delivery') {
    totalDesc = `\u20B9${ceState.totalCost.toFixed(2)} (incl. \u20B9${DELIVERY_FEE} Delivery)`;
  }
  document.getElementById('ceResTotal').textContent = totalDesc;
};

window.proceedToPayment = function () {
  if (!ceState.pages) {
    showToast('Please upload a PDF first!');
    return;
  }
  if (!currentUser) {
    showToast('Please log in to place a photocopy order.');
    window.location.href = 'login.html';
    return;
  }
  const hint = document.getElementById('ceLoggedInHint');
  if (hint) {
    hint.style.display = 'block';
    const ph = (currentUser.phone || '').trim();
    const nm = (currentUser.name || '').trim() || 'Account';
    hint.textContent = ph ? `Ordering as: ${nm} (${ph})` : `Ordering as: ${nm}`;
  }

  // Update order summary
  const summaryEl = document.getElementById('ceOrderSummaryText');
  if (summaryEl) {
    const sizeLabel = { a4: 'A4', a3: 'A3', legal: 'Legal', letter: 'Letter' };
    summaryEl.textContent = `${ceState.pages} pages \u00D7 ${ceState.copies} cop${ceState.copies > 1 ? 'ies' : 'y'} | ${ceState.printType === 'bw' ? 'B&W' : 'Colour'} | ${sizeLabel[ceState.paperSize] || ceState.paperSize} | ${ceState.sides === 'double' ? 'Double' : 'Single'}-sided \u2192 \u20B9${ceState.totalCost.toFixed(2)}`;
  }

  const ta = document.getElementById('ceCustomerAddress');
  if (ta && !ta.value.trim()) {
    const d = getSavedDeliveryDetails();
    const line2 = [d.city, d.pincode].filter(Boolean).join(' ');
    const parts = [d.street, line2].filter(Boolean);
    if (parts.length) ta.value = parts.join('\n');
  }

  document.getElementById('ceStepEstimate').style.display = 'none';
  document.getElementById('ceStepOrder').style.display = 'block';
};

window.ceGoBack = function () {
  document.getElementById('ceStepOrder').style.display = 'none';
  document.getElementById('ceStepEstimate').style.display = 'block';
};

window.placeCopyOrder = async function (e) {
  e.preventDefault();
  const btn = document.getElementById('cePlaceOrderBtn');
  if (!currentUser) {
    showToast('Please log in to place an order.');
    window.location.href = 'login.html';
    return;
  }
  const name = (currentUser.name || '').trim() || 'Customer';
  const phone = (currentUser.phone || '').trim();
  if (!phone) {
    showToast('Your account has no phone number. Update your profile after login.');
    return;
  }
  const address = document.getElementById('ceCustomerAddress').value.trim();
  if (!address) {
    showToast('Please enter pickup or delivery address.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Uploading doc & finalizing order...';
  const sizeLabel = { a4: 'A4', a3: 'A3', legal: 'Legal', letter: 'Letter' };
  const orderId = 'COPY' + Date.now();

  // --- Upload PDF to Supabase storage ---
  let docUrl = null;
  let storagePath = null;
  const supabase = getSupabase();
  if (supabase && ceState.pdfFiles && ceState.pdfFiles.length) {
    try {
      const uploadedUrls = [];
      const uploadedPaths = [];
      for (let i = 0; i < ceState.pdfFiles.length; i++) {
        const file = ceState.pdfFiles[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${orderId}_${i + 1}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('photocopy-docs')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type || 'application/pdf'
          });
        if (!upErr) {
          const { data: pubData } = supabase.storage.from('photocopy-docs').getPublicUrl(path);
          uploadedUrls.push(pubData.publicUrl);
          uploadedPaths.push(path);
        } else {
          console.warn('Doc upload failed:', upErr.message);
        }
      }
      if (uploadedPaths.length) {
        storagePath = uploadedPaths.join('|');
        docUrl = uploadedUrls.join('|');
      } else {
        showToast('PDF upload failed (order will continue without files if DB allows).');
      }
    } catch (err) {
      console.error('Storage error:', err);
      showToast('PDF upload error — check Storage bucket "photocopy-docs" and policies.');
    }
  } else if (supabase && !(ceState.pdfFiles && ceState.pdfFiles.length) && ceState.pages && !ceState.manualPages) {
    showToast('PDF file missing — go back and upload the PDF again.');
  }

  const orderData = {
    id: orderId,
    customer_name: name,
    customer_phone: phone,
    address: address,
    pages: ceState.pages,
    copies: ceState.copies,
    print_type: ceState.printType === 'bw' ? 'B&W' : 'Colour',
    paper_size: sizeLabel[ceState.paperSize] || ceState.paperSize,
    sides: ceState.sides === 'double' ? 'Double-sided' : 'Single-sided',
    delivery_mode: ceState.deliveryMode,
    total_cost: ceState.totalCost,
    payment_method: ceState.payment,
    doc_url: docUrl,
    doc_path: storagePath,
    status: 'Pending',
    created_at: new Date().toISOString()
  };

  if (ceState.payment === 'Online') {
    // 1. Online flow -> delegate to backend
    processSecureRazorpayPayment(ceState.totalCost, orderData, 'photocopy', (success, txnId) => {
      btn.disabled = false;
      btn.textContent = 'Place Photocopy Order';

      if (success) {
        saveSavedDeliveryDetails({ street: address });
        sessionStorage.setItem("orderBanner", "success");
        window.location.href = 'my-orders.html';
      }
    });

  } else {
    // 2. COD flow -> save directly from frontend
    let success = false;
    if (supabase) {
      try {
        let { error } = await supabase.from('photocopy_orders').insert(orderData);
        if (error && error.message && /doc_url|doc_path|column/i.test(error.message)) {
          const slim = { ...orderData };
          delete slim.doc_url; delete slim.doc_path; delete slim.delivery_mode;
          let retry = await supabase.from('photocopy_orders').insert(slim);
          error = retry.error;
        }
        if (!error) success = true;
      } catch (err) { console.error(err); }
    }

    if (!success) {
      try {
        const local = JSON.parse(localStorage.getItem('photocopy_orders') || '[]');
        local.unshift(orderData);
        localStorage.setItem('photocopy_orders', JSON.stringify(local));
        success = true;
      } catch (e) { }
    }

    btn.disabled = false;
    btn.textContent = 'Place Photocopy Order';

    if (success) {
      saveSavedDeliveryDetails({ street: address });
      sessionStorage.setItem("orderBanner", "cod");
      window.location.href = 'my-orders.html';
    }
  }
};

// ---- Admin Photocopy Orders ----
function normalizePhotocopyOrderRow(o) {
  if (!o) return o;
  const doc_path = o.doc_path != null && o.doc_path !== '' ? o.doc_path : (o.docPath || null);
  const doc_url = o.doc_url != null && o.doc_url !== '' ? o.doc_url : (o.docUrl || null);
  return { ...o, doc_path, doc_url };
}

async function resolvePhotocopyPdfHref(supabase, o) {
  const path = (o.doc_path || '').split('|')[0];
  const fallbackPublic = (o.doc_url || '').split('|')[0];
  if (!path) return fallbackPublic || null;
  if (!supabase) return fallbackPublic || null;
  try {
    const { data, error } = await supabase.storage
      .from('photocopy-docs')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!error && data && data.signedUrl) return data.signedUrl;
  } catch (e) {
    console.warn('Photocopy signed URL:', e);
  }
  return fallbackPublic || null;
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function renderAdminPhotocopyOrders(useCache = false) {
  const container = document.getElementById('adminPhotocopyOrdersList');
  if (!container) return;

  container.innerHTML = `<div style="padding:24px; color:var(--text-muted); text-align:center;">Loading photocopy orders...</div>`;

  let orders = [];
  const supabase = getSupabase();
  if (useCache && Array.isArray(window._adminPhotocopyRaw)) {
    orders = window._adminPhotocopyRaw;
  } else {
    try {
      const res = await apiFetch("/admin/orders?order_type=photocopy", { method: "GET" });
      orders = (res && res.orders) || [];
    } catch (err) {
      orders = [];
      showToast(err.message || "Failed to load photocopy orders");
    }
    window._adminPhotocopyRaw = orders;
  }

  const copyCountEl = document.getElementById('adminPhotocopyCountLabel');
  if (copyCountEl) copyCountEl.textContent = 'Total photocopy orders: ' + orders.length;

  if (!orders.length) {
    container.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-muted);">No photocopy orders yet.</div>`;
    return;
  }

  const q = getTrimmedInputValue('adminPhotocopySearch').toLowerCase();
  const baseList = q ? orders.filter(o => String(o.id || '').toLowerCase().includes(q)) : orders;
  if (!baseList.length) {
    container.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-muted);">No orders match this Order ID.</div>`;
    return;
  }

  const rows = await Promise.all(
    baseList.map(async (raw) => {
      const o = normalizePhotocopyOrderRow(raw);
      const pdfHref = await resolvePhotocopyPdfHref(supabase, o);
      return { ...o, _pdfHref: pdfHref };
    })
  );

  const activeOrders = rows.filter(o => o.status !== 'Completed' && o.status !== 'Delivered' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return'));
  const completedOrders = rows.filter(o => o.status === 'Completed' || o.status === 'Delivered' || o.status === 'Cancelled' || String(o.status || '').includes('Return'));

  const renderList = (list) => {
    if (!list.length) return `<div style="padding: 12px; color: var(--text-muted);">No orders in this category.</div>`;
    return list.map(o => {
      const date = o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : '\u2013';
      const statusColor = { Pending: '#f59e0b', Processing: '#3b82f6', Ready: '#8b5cf6', Completed: '#10b981', Cancelled: '#ef4444' };
      const sc = statusColor[o.status] || '#888';
      const docPathForDel = o.doc_path || '';
      const docPathEncoded = docPathForDel ? encodeURIComponent(docPathForDel) : '';
      const hasStoredFile = !!(o.doc_path && String(o.doc_path).trim());
      const pdfLink = o._pdfHref;
      const pdfBlock = pdfLink ? `
          <div style="background:linear-gradient(90deg,rgba(37,117,252,0.08),rgba(106,17,203,0.08)); border:1px solid rgba(37,117,252,0.2); border-radius:10px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2575fc" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Customer PDF attached</span>
            </div>
            <a href="${escAttr(pdfLink)}" target="_blank" rel="noopener noreferrer" style="background:#2575fc; color:#fff; padding:5px 14px; border-radius:6px; font-size:0.8rem; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:5px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              View / Download PDF
            </a>
          </div>` : (hasStoredFile ? `
          <div style="background:var(--card-bg); border:1px dashed var(--border-color); border-radius:8px; padding:8px 14px; margin-bottom:14px; font-size:0.8rem; color:var(--text-muted);">
            PDF path in storage: <code style="font-size:0.75rem;">${escAttr(o.doc_path)}</code> — link could not be created.
          </div>` : `
          <div style="background:var(--card-bg); border:1px dashed var(--border-color); border-radius:8px; padding:8px 14px; margin-bottom:14px; font-size:0.8rem; color:var(--text-muted);">
            No PDF attached to this order.
          </div>`);
      return `
        <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:20px; margin-bottom:18px; box-shadow:var(--shadow-sm);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:14px; border-bottom:1px solid var(--border-color); padding-bottom:14px;">
            <div>
              <div style="font-weight:700; font-size:1rem; color:var(--text-main);">${o.id}</div>
              <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">${date}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              ${o.status === 'Cancelled' ? `<span style="background:#ff3b3020; color:#ff3b30; border:1px solid #ff3b30; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">Cancelled</span>` : `<span style="background:${sc}20; color:${sc}; border:1px solid ${sc}; padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700;">${o.status || 'Pending'}</span>`}
              
              ${(o.status !== 'Completed' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return')) ? `<button onclick="updatePhotocopyStatus('${o.id}', 'Completed')" style="background:#10b98115; color:#10b981; border:1px solid #10b98140; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#10b98125'" onmouseout="this.style.background='#10b98115'">Mark Completed</button>` : ''}
              
              <button onclick="deletePhotocopyOrder('${o.id}', '${docPathEncoded}')" style="background:#ff3b3015; color:#ff3b30; border:1px solid #ff3b3040; padding:5px 12px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;" onmouseover="this.style.background='#ff3b3025'" onmouseout="this.style.background='#ff3b3015'">Delete</button>
            </div>
          </div>

          ${pdfBlock}

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:12px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Customer</div>
              <div style="font-weight:600; color:var(--text-main);">${o.customer_name}</div>
              <div style="font-size:0.85rem; color:var(--text-muted);">${o.customer_phone}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Print Details</div>
              <div style="font-weight:600; color:var(--text-main);">${o.pages} pages \u00D7 ${o.copies} cop${o.copies > 1 ? 'ies' : 'y'}</div>
              <div style="font-size:0.85rem; color:var(--text-muted);">${o.print_type} | ${o.paper_size} | ${o.sides}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Address</div>
              <div style="font-size:0.85rem; color:var(--text-main);">${o.address}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Payment</div>
              <div style="font-weight:700; color:var(--primary); font-size:1.1rem;">\u20B9${Number(o.total_cost).toFixed(2)}</div>
              <div style="font-size:0.82rem; color:var(--text-muted);">${o.payment_method}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  container.innerHTML = `
    <div style="background:var(--primary); color:#fff; padding:12px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; font-size:1.15rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Active Orders
    </div>
    <div style="background:rgba(0,0,0, 0.02); border:1px solid var(--border-color); border-top:none; border-radius:0 0 var(--radius-md) var(--radius-md); padding:20px; margin-bottom:32px; box-shadow:var(--shadow-sm);">
      ${renderList(activeOrders)}
    </div>
    <div style="background:#10b981; color:#fff; padding:12px 20px; border-radius:var(--radius-md) var(--radius-md) 0 0; font-size:1.15rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Completed & Cancelled
    </div>
    <div style="background:rgba(16,185,129,0.02); border:1px solid var(--border-color); border-top:none; border-radius:0 0 var(--radius-md) var(--radius-md); padding:20px; box-shadow:var(--shadow-sm);">
      ${renderList(completedOrders)}
    </div>
  `;
}

window.deletePhotocopyOrder = async function (orderId, docPathEncoded) {
  if (!confirm('Delete this photocopy order and its attached PDF? This cannot be undone.')) return;

  showGlobalLoader(true, `Say bye bye to ${orderId} 👋`);
  const supabase = getSupabase();
  if (supabase) {
    // 1. Delete PDF from storage (if exists)
    if (docPathEncoded) {
      try {
        const decoded = decodeURIComponent(docPathEncoded);
        const allPaths = decoded.split('|').map(s => s.trim()).filter(Boolean);
        if (allPaths.length) await supabase.storage.from('photocopy-docs').remove(allPaths);
      } catch (e) { console.warn('Storage delete failed:', e); }
    }
  }
  // 2. Delete DB record (admin protected)
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=photocopy`, { method: "DELETE" });
  } catch (err) {
    showGlobalLoader(false);
    showToast(err.message || "Delete failed");
    return;
  }
  showToast('Order and PDF deleted successfully.');
  await renderAdminPhotocopyOrders();
  showGlobalLoader(false);
};

window.updatePhotocopyStatus = async function (orderId, newStatus) {
  try {
    await apiFetch(`/admin/orders/${encodeURIComponent(orderId)}?order_type=photocopy`, { method: "PATCH", body: { status: newStatus } });
  } catch (err) {
    showToast(err.message || "Update failed");
    return;
  }
  showToast('Status updated!');
};

// ==========================================
// PDF Viewer and Notes Checkout Logic
// ==========================================
function hasUnlockedNote(noteId) {
  if (!currentUser) return false;
  const purchases = JSON.parse(localStorage.getItem('shubham_note_purchases') || '[]');
  if (purchases.includes(`${currentUser.phone}_${noteId}`)) return true;
  return false;
}

let currentPdfDoc = null;
let currentPdfPage = 1;
let viewerNoteId = null;
let viewerNotePrice = 0;
let viewerNoteTitle = '';
let viewerSecureModeEnabled = false;
let viewerRequiresPurchase = false;
const MAX_PREVIEW_PAGES = 2;

let pdfViewerGuardBound = false;
const pdfViewerGuards = { onContextMenu: null, onKeydown: null, onDragStart: null, onVisibility: null, onBlur: null, onPageHide: null };
let displayCaptureHooked = false;

function hookDisplayCaptureDetection() {
  if (displayCaptureHooked) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    displayCaptureHooked = true;
    return;
  }
  const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async function (...args) {
    if (currentPdfDoc) {
      showToast('Screen capture detected. Viewer closed.');
      closePdfViewer();
      throw new Error('Screen capture blocked during secure viewing.');
    }
    return originalGetDisplayMedia(...args);
  };
  displayCaptureHooked = true;
}

function addPdfViewerGuards() {
  if (pdfViewerGuardBound) return;
  const modal = document.getElementById('pdfViewerModal');
  if (!modal) return;
  pdfViewerGuards.onContextMenu = (e) => {
    if (viewerSecureModeEnabled && modal.contains(e.target)) e.preventDefault();
  };
  pdfViewerGuards.onKeydown = (e) => {
    if (!viewerSecureModeEnabled) return;
    const k = String(e.key || '').toLowerCase();
    if (((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p' || k === 'u')) || k === 'printscreen') {
      e.preventDefault();
      showToast('This PDF is view-only.');
    }
  };
  pdfViewerGuards.onDragStart = (e) => {
    if (viewerSecureModeEnabled && modal.contains(e.target)) e.preventDefault();
  };
  pdfViewerGuards.onVisibility = () => {
    if (currentPdfDoc && document.hidden) {
      showToast('Viewer closed for security.');
      closePdfViewer();
    }
  };
  pdfViewerGuards.onBlur = () => {
    if (currentPdfDoc) {
      showToast('Viewer closed for security.');
      closePdfViewer();
    }
  };
  pdfViewerGuards.onPageHide = () => {
    if (currentPdfDoc) closePdfViewer();
  };
  document.addEventListener('contextmenu', pdfViewerGuards.onContextMenu);
  document.addEventListener('keydown', pdfViewerGuards.onKeydown);
  document.addEventListener('dragstart', pdfViewerGuards.onDragStart);
  document.addEventListener('visibilitychange', pdfViewerGuards.onVisibility);
  window.addEventListener('blur', pdfViewerGuards.onBlur);
  window.addEventListener('pagehide', pdfViewerGuards.onPageHide);
  pdfViewerGuardBound = true;
}

function removePdfViewerGuards() {
  if (!pdfViewerGuardBound) return;
  document.removeEventListener('contextmenu', pdfViewerGuards.onContextMenu);
  document.removeEventListener('keydown', pdfViewerGuards.onKeydown);
  document.removeEventListener('dragstart', pdfViewerGuards.onDragStart);
  document.removeEventListener('visibilitychange', pdfViewerGuards.onVisibility);
  window.removeEventListener('blur', pdfViewerGuards.onBlur);
  window.removeEventListener('pagehide', pdfViewerGuards.onPageHide);
  pdfViewerGuardBound = false;
}

function addPdfWatermark(ctx, canvas) {
  if (!currentPdfDoc) return;
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = 'bold 104px Inter, Arial, sans-serif';
  ctx.fillText('Shubham Xerox', 0, -36);
  ctx.font = 'bold 52px Inter, Arial, sans-serif';
  ctx.fillText('No:-9826462963', 0, 56);
  ctx.restore();
}

window.openPdfViewer = async function (url, price, id, title) {
  const modal = document.getElementById('pdfViewerModal');
  if (!modal) return;

  if (!currentUser) {
    showToast("Please login first to preview and purchase notes.");
    setTimeout(() => window.location.href = "login.html", 1500);
    return;
  }

  viewerNoteId = id;
  viewerNotePrice = price;
  viewerNoteTitle = title;
  viewerRequiresPurchase = Number(price) > 0;
  viewerSecureModeEnabled = hasUnlockedNote(id);

  document.getElementById('pdfViewerTitle').textContent = `${viewerRequiresPurchase ? (viewerSecureModeEnabled ? 'Secure View' : 'Preview') : 'Viewer'}: ${title}`;
  document.getElementById('pdfViewerLockScreen').style.display = 'none';
  document.getElementById('pdfPageNum').textContent = '1';
  document.getElementById('pdfPageCount').textContent = '-';
  const jumpInput = document.getElementById('pdfJumpInput');
  if (jumpInput) jumpInput.value = '';

  const canvas = document.getElementById('pdfViewerCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  hookDisplayCaptureDetection();
  addPdfViewerGuards();

  try {
    if (!window.pdfjsLib) throw new Error("PDF Library not loaded");
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    currentPdfDoc = await pdfjsLib.getDocument(url).promise;
    document.getElementById('pdfPageCount').textContent = currentPdfDoc.numPages;
    currentPdfPage = 1;
    renderPdfPage(currentPdfPage);
  } catch (e) {
    showToast("Failed to load PDF preview.");
    console.error(e);
  }
};

window.closePdfViewer = function () {
  const modal = document.getElementById('pdfViewerModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  const fsBtn = document.getElementById('pdfFullscreenBtn');
  if (fsBtn) fsBtn.textContent = 'Fullscreen';
  currentPdfDoc = null;
  viewerSecureModeEnabled = false;
  viewerRequiresPurchase = false;
  removePdfViewerGuards();
};

window.togglePdfFullscreen = async function () {
  const modal = document.getElementById('pdfViewerModal');
  const fsBtn = document.getElementById('pdfFullscreenBtn');
  if (!modal) return;
  try {
    if (!document.fullscreenElement) {
      await modal.requestFullscreen();
      if (fsBtn) fsBtn.textContent = 'Exit Fullscreen';
    } else {
      await document.exitFullscreen();
      if (fsBtn) fsBtn.textContent = 'Fullscreen';
    }
  } catch (e) {
    showToast('Fullscreen not supported on this browser.');
  }
};

document.addEventListener('fullscreenchange', () => {
  const fsBtn = document.getElementById('pdfFullscreenBtn');
  if (fsBtn) fsBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('pdfViewerModal')?.style.display === 'flex') {
    const active = document.activeElement;
    if (active && active.id === 'pdfJumpInput') {
      e.preventDefault();
      goToPdfPage();
    }
  }
});

async function renderPdfPage(num) {
  if (!currentPdfDoc) return;

  const lockScreen = document.getElementById('pdfViewerLockScreen');
  if (viewerRequiresPurchase && num > MAX_PREVIEW_PAGES && !hasUnlockedNote(viewerNoteId)) {
    lockScreen.style.display = 'flex';
    document.getElementById('btnBuyPdfUnlock').onclick = () => purchaseNote(viewerNoteId, viewerNotePrice, viewerNoteTitle);
    return;
  } else {
    lockScreen.style.display = 'none';
  }

  try {
    const page = await currentPdfDoc.getPage(num);
    const canvas = document.getElementById('pdfViewerCanvas');
    const ctx = canvas.getContext('2d');

    const viewport = page.getViewport({ scale: window.innerWidth < 600 ? 1.0 : 1.5 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    addPdfWatermark(ctx, canvas);
    document.getElementById('pdfPageNum').textContent = Math.min(num, currentPdfDoc.numPages);
  } catch (e) {
    console.error("Render page err:", e);
  }
}

window.pdfPrevPage = function () {
  if (currentPdfPage <= 1) return;
  currentPdfPage--;
  renderPdfPage(currentPdfPage);
};

window.pdfNextPage = function () {
  if (!currentPdfDoc || currentPdfPage >= currentPdfDoc.numPages) return;
  if (viewerRequiresPurchase && currentPdfPage >= MAX_PREVIEW_PAGES && !hasUnlockedNote(viewerNoteId)) {
    currentPdfPage++;
    renderPdfPage(currentPdfPage);
    return;
  }
  currentPdfPage++;
  renderPdfPage(currentPdfPage);
};

window.goToPdfPage = function () {
  if (!currentPdfDoc) return;
  const jumpInput = document.getElementById('pdfJumpInput');
  if (!jumpInput) return;
  const targetPage = parseInt(jumpInput.value, 10);
  if (!targetPage || targetPage < 1 || targetPage > currentPdfDoc.numPages) {
    showToast('Enter valid page number.');
    return;
  }
  if (viewerRequiresPurchase && targetPage > MAX_PREVIEW_PAGES && !hasUnlockedNote(viewerNoteId)) {
    showToast('Purchase required for this page.');
    currentPdfPage = MAX_PREVIEW_PAGES + 1;
    renderPdfPage(currentPdfPage);
    return;
  }
  currentPdfPage = targetPage;
  renderPdfPage(currentPdfPage);
};

function purchaseNote(id, price, title) {
  const orderData = {
    id: "NORD" + Date.now(),
    customer: currentUser.name,
    customerphone: currentUser.phone,
    address: 'Digital Product',
    items: [{ id: id, name: title, price: price, quantity: 1, type: 'note' }],
    total: price,
    method: 'Online',
    status: 'Completed',
    date: new Date().toLocaleString()
  };

  const btn = document.getElementById('btnBuyPdfUnlock');
  btn.disabled = true;
  btn.textContent = "Processing...";

  processSecureRazorpayPayment(price, orderData, 'books', async (success, txnId) => {
    btn.disabled = false;
    btn.textContent = "Buy Now to Unlock";

    if (success) {
      const purchases = JSON.parse(localStorage.getItem('shubham_note_purchases') || '[]');
      purchases.push(`${currentUser.phone}_${id}`);
      localStorage.setItem('shubham_note_purchases', JSON.stringify(purchases));

      showToast("Payment Successful! PDF Unlocked.");
      closePdfViewer();
      if (document.getElementById('freeNotesContainer')) {
        renderFreeNotesGrid(freeNotesData);
      }
    }
  });
}

function updateHeroRates() {
  const bwEl = document.getElementById('heroRateBw');
  const colorEl = document.getElementById('heroRateColor');
  if (bwEl && colorEl) {
    const rates = getCeRates();
    bwEl.textContent = `₹${rates.bw}`;
    colorEl.textContent = `₹${rates.color}`;
  }
}
document.addEventListener('DOMContentLoaded', updateHeroRates);


