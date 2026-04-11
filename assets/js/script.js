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

const defaultProducts = [
  { name: "MPPSC Prelims Unit 03: Geography of India", category: "AKAR IAS HINDI MEDIUM PRE", price: 176, img: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80", desc: "Comprehensive notes covering the complete geography syllabus for MPPSC Prelims Unit 03." },
  { name: "Satyamev Jayate Institute - MPPSC Mains Short Notes", category: "Satyamev Jayate institute", price: 700, img: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80", desc: "Highly condensed and easy-to-revise short notes for MPPSC Mains by Satyamev Jayate Institute." },
  { name: "आध�?निक भारतीय इतिहास | Latest 2026", category: "NIRMAN IAS", price: 150, img: "https://images.unsplash.com/photo-1589998059171-988d887df646?auto=format&fit=crop&w=400&q=80", desc: "Modern Indian History textbook customized for 2026 exams in Hindi Medium." },
  { name: "Modern Indian History | Latest 2026", category: "Champion Square English Medium", price: 140, img: "https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=400&q=80", desc: "Modern Indian History textbook customized for 2026 exams in English Medium." },
  { name: "UPSC Blank Practice Answer Sheet (Pack of 3)", category: "Stationery", price: 300, img: "https://images.unsplash.com/photo-1589330694653-efa6573635ce?auto=format&fit=crop&w=400&q=80", desc: "Standard UPSC format blank answer sheets for Mains answer writing practice." },
  { name: "Unit-10 Chart (Tribes of MP)", category: "DEVANAGARI", price: 40, img: "https://images.unsplash.com/photo-1503694978374-8a2fa686963a?auto=format&fit=crop&w=400&q=80", desc: "A detailed wall chart covering the tribes of Madhya Pradesh as per Unit-10 syllabus." },
  { name: "MPPSC Prelims 2024-25 | Unit 6", category: "Parikshadham", price: 240, img: "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?auto=format&fit=crop&w=400&q=80", desc: "In-depth coverage of Indian and MP Economy for MPPSC Prelims Unit 6." },
  { name: "Science & Env Notes", category: "Tathyabaan", price: 250, img: "https://images.unsplash.com/photo-1610116306796-6fea9f4fae38?auto=format&fit=crop&w=400&q=80", desc: "Authoritative notes for Science, Technology, and Environment." },
  { name: "English Medium Notes Bundle", category: "CIVIL JOB", price: 800, img: "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=400&q=80", desc: "Complete bundle of printed notes in English Medium." }
];

// Constants
const ADMIN_PHONE = "6265660387";
const WHATSAPP_NUMBER = "919826462963";
const DELIVERY_FEE = 70;

let products = [];
let cart = [];
let currentUser = null;
let reviews = {};
let selectedCategories = [];

const defaultSiteCategories = [
  "AKAR IAS HINDI MEDIUM PRE", "Arihant", "Champion Square English Medium", "Champion Square Hindi Medium", "CIVIL JOB", "Cosmos Publication", "Darpan Civil Services", "DEVANAGARI", "Exam Pedia", "Gagan Pratap Sir", "Ghatna Chakra", "KARMA IAS", "lucent", "MAINSWALA", "MGICS", "MPPSC MAINS TEST SERIES", "MPPSC PRE TEST 2026", "NEW BOOKS 📚", "NIRMAN IAS", "Omkar Publication", "Pariksha Portal", "Parikshadham", "Parmar SSC", "PT 365", "Punekar Publication", "Rakesh Yadav", "Saransh Ics", "Satyamev Jayate institute", "Selection Tak", "Shivaan Educations", "SHREE KABIR PUBLICATION", "SHUBHAM GUPTA SIR", "Stationery", "Tathyabaan", "Upsc Test Series", "UTKARSH CLASSESS", "XEROX"
];

let siteCategories = [];

// Safe Storage Initialization
try {
  cart = JSON.parse(localStorage.getItem('shubham_cart')) || [];
  currentUser = JSON.parse(localStorage.getItem('shubham_current_user')) || null;
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

// --- Data Fetching logic ---
async function fetchProducts() {
  const supabase = getSupabase();
  if (!supabase) {
    products = JSON.parse(localStorage.getItem('shubham_products')) || defaultProducts;
    return;
  }
  try {
    const { data, error } = await supabase.from('products').select('*').order('id', { ascending: true });
    if (data && data.length > 0) {
      products = data;
    } else {
      await supabase.from('products').insert(defaultProducts);
      const { data: newData } = await supabase.from('products').select('*').order('id', { ascending: true });
      products = newData || [];
    }
  } catch (e) {
    products = JSON.parse(localStorage.getItem('shubham_products')) || defaultProducts;
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
      if (currentUser.phone === ADMIN_PHONE) {
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

function requestOTP() {
  const phone = document.getElementById('phone').value;
  if (phone.length === 10) {
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
  } else {
    showToast("Enter a valid 10-digit number.");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('phone').value;
  const otp = document.getElementById('otp').value;

  if (otp === "1234") {
    let user = null;
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data } = await supabase.from('users').select('*').eq('phone', phone).single();
        user = data;
      } catch (e) {
        console.error(e);
      }
    }

    if (!user && phone === ADMIN_PHONE) {
      const newUser = { phone, name: "Admin", role: "admin" };
      if (supabase) await supabase.from('users').insert(newUser);
      user = newUser;
    }

    if (user) {
      currentUser = user;
      localStorage.setItem('shubham_current_user', JSON.stringify(user));
      window.location.href = phone === ADMIN_PHONE ? "admin.html" : "index.html";
    } else {
      showToast("Account not found. Please register first.");
      setTimeout(() => window.location.href = "register.html", 1500);
    }
  } else {
    showToast("Invalid OTP! Use 1234");
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const phone = document.getElementById('regPhone').value;

  let existing = null;
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase.from('users').select('phone').eq('phone', phone).single();
    existing = data;
  }

  if (existing) {
    showToast("Phone number already registered. Please login.");
    setTimeout(() => window.location.href = "login.html", 1500);
    return;
  }

  const role = phone === ADMIN_PHONE ? "admin" : "user";
  const newUser = { phone, name, role };
  if (supabase) {
    try {
      await supabase.from('users').insert(newUser);
    } catch (e) { console.error(e); }
  }

  currentUser = newUser;
  localStorage.setItem('shubham_current_user', JSON.stringify(newUser));
  window.location.href = "index.html";
}

function logout() {
  localStorage.removeItem('shubham_current_user');
  window.location.href = "index.html";
}

// --- Secure Full-Stack Razorpay Integration ---
async function processSecureRazorpayPayment(amount, orderData, orderType, onComplete) {
  try {
    // 1. Create order on backend
    const createRes = await fetch("https://shubhamxerox-production.up.railway.app/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
        ondismiss: function() {
          showToast("Payment interface closed safely.");
          onComplete(false);
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response){
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
    date: new Date().toLocaleString(),
    created_at: new Date().toISOString()
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
          <img src="${product.img}" alt="${product.name}" loading="lazy">
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
  const allCats = [...new Set([...siteCategories, ...products.map(p => p.category)])].sort();

  container.innerHTML = allCats.map(c => `
    <label class="multi-select-option">
      <input type="checkbox" value="${c}" onchange="handleCategoryToggle(this)">
      <span>${c}</span>
    </label>
  `).join('');
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
  let filtered = products;
  if (filterCategories && filterCategories.length > 0) {
    filtered = products.filter(p => filterCategories.includes(p.category));
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput && searchInput.value) {
    const q = searchInput.value.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
  }
  if (limit) filtered = filtered.slice(0, limit);
  container.innerHTML = filtered.map(createProductCard).join('');
}

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
      <img src="${item.img}" class="cart-item-img" alt="${item.name}">
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

async function handleAddProduct(e) {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const price = parseFloat(document.getElementById('price').value);
  const rawOriginal = document.getElementById('originalPrice').value;
  const original_price = rawOriginal ? parseFloat(rawOriginal) : null;
  const category = document.getElementById('category').value;
  let imgUrl = document.getElementById('img').value;
  const fileInput = document.getElementById('imgUpload');

  const addNode = async (imageSrc) => {
    const finalImg = imageSrc || "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80";
    const supabase = getSupabase();
    if (supabase) {
      const payload = { name, price, category, img: finalImg };
      if (original_price) payload.original_price = original_price;

      let { error } = await supabase.from('products').insert(payload);

      // Fallback if the Supabase table doesn't have the original_price column yet
      if (error && error.message && error.message.includes('original_price')) {
        delete payload.original_price;
        const retry = await supabase.from('products').insert(payload);
        error = retry.error;
        if (!error) {
          showToast("Product added! (Note: 'original_price' column missing in Supabase Settings)");
          e.target.reset();
          if (document.getElementById('adminProductsList')) await renderAdminList();
          return;
        }
      }

      if (error) {
        showToast("SQL Error: " + error.message);
        console.error(error);
        return;
      } else {
        showToast("Product added successfully!");
      }
    }
    e.target.reset();
    if (document.getElementById('adminProductsList')) await renderAdminList();
  };

  if (fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = function (evt) { addNode(evt.target.result); };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    addNode(imgUrl);
  }
}

async function removeProduct(id) {
  const supabase = getSupabase();
  if (supabase) await supabase.from('products').delete().eq('id', id);
  await renderAdminList();
}

async function renderAdminList() {
  const container = document.getElementById('adminProductsList');
  if (container) {
    const supabase = getSupabase();
    if (supabase) {
      const { data: dbProducts } = await supabase.from('products').select('*').order('id', { ascending: true });
      if (dbProducts) products = dbProducts;
    }
    container.innerHTML = products.map(p => `
      <div class="admin-list-item">
        <div style="display:flex; gap:12px; align-items:center;">
          <img src="${p.img}" style="width:40px; height:40px; border-radius:4px; object-fit:cover;">
          <div>
            <strong>${p.name}</strong> <br>
            <span style="color: var(--text-muted); font-size: 0.85rem;">${p.category} | ${formatPrice(p.price)}</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openEditModal(${p.id})">Edit</button>
          <button class="remove-btn" onclick="removeProduct(${p.id})">Delete</button>
        </div>
      </div>
    `).join('');
  }
}

async function renderAdminUsers() {
  const userContainer = document.getElementById('adminUsersList');
  if (userContainer) {
    let dbUsers = [];
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase.from('users').select('*');
      dbUsers = data || [];
    }
    if (dbUsers.length === 0) {
      userContainer.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">No users found. Wait for users to register.</div>';
    } else {
      userContainer.innerHTML = dbUsers.map(u => `
        <div class="admin-list-item">
          <div><strong>${u.name}</strong> <span style="font-size:0.8rem; background:var(--bg-color); padding:2px 6px; border-radius:4px;">${u.role}</span></div>
          <div style="color:var(--text-muted);">${u.phone}</div>
        </div>
      `).join('');
    }
  }
}

// Edit Modal Logic
window.openEditModal = function (id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  document.getElementById('editProductId').value = product.id;
  document.getElementById('editName').value = product.name;
  document.getElementById('editPrice').value = product.price;
  document.getElementById('editOriginalPrice').value = product.original_price || '';
  document.getElementById('editCategory').value = product.category;
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
  const id = parseInt(document.getElementById('editProductId').value);
  const name = document.getElementById('editName').value;
  const price = parseFloat(document.getElementById('editPrice').value);
  const rawOriginal = document.getElementById('editOriginalPrice').value;
  const original_price = rawOriginal ? parseFloat(rawOriginal) : null;
  const category = document.getElementById('editCategory').value;
  const imgUrl = document.getElementById('editImg').value;
  const fileInput = document.getElementById('editImgUpload');

  const updateNode = async (imageSrc) => {
    const finalImg = imageSrc || "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80";
    const supabase = getSupabase();
    if (supabase) {
      const payload = { name, price, category, img: finalImg };
      if (original_price) payload.original_price = original_price;
      else payload.original_price = null; // Clear if emptied

      let { error } = await supabase.from('products').update(payload).eq('id', id);

      // Fallback if the Supabase table doesn't have the original_price column yet
      if (error && error.message && error.message.includes('original_price')) {
        delete payload.original_price;
        const retry = await supabase.from('products').update(payload).eq('id', id);
        error = retry.error;
        if (!error) {
          showToast("Updated! (Note: Add 'original_price' column in Supabase to save MRP)");
          closeEditModal();
          await renderAdminList();
          return;
        }
      }

      if (error) {
        showToast("SQL Error: " + error.message);
        return;
      } else {
        showToast("Product updated successfully!");
      }
    }
    closeEditModal();
    await renderAdminList();
  };

  if (fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = function (evt) { updateNode(evt.target.result); };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    updateNode(imgUrl);
  }
}


async function renderAdminOrders() {
  const container = document.getElementById('adminOrdersList');
  if (!container) return;

  const countLabel = document.getElementById('adminOrdersCountLabel');
  let dbOrders = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase.from('orders').select('*').order('date', { ascending: false });
    dbOrders = data || [];
  }

  if (countLabel) {
    countLabel.textContent = 'Total book orders: ' + dbOrders.length;
  }

  if (dbOrders.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No orders yet.</div>`;
    return;
  }

  window.ordersListContext = dbOrders;
  const activeOrders = dbOrders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled' && !String(o.status || '').includes('Return'));
  const completedOrders = dbOrders.filter(o => o.status === 'Delivered' || o.status === 'Cancelled' || String(o.status || '').includes('Return'));

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

async function renderAdminReturns() {
  const container = document.getElementById('adminReturnsList');
  if (!container) return;

  let dbOrders = [];
  let dbCopies = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data: b } = await supabase.from('orders').select('*').eq('status', 'Return Requested').order('date', { ascending: false });
    dbOrders = b || [];
    const { data: c } = await supabase.from('photocopy_orders').select('*').eq('status', 'Return Requested').order('created_at', { ascending: false });
    dbCopies = c || [];
  }

  const merged = [
    ...dbOrders.map((o) => ({ kind: 'book', o, t: getBookOrderPlacedAtMs(o) })),
    ...dbCopies.map((o) => ({ kind: 'photocopy', o, t: getPhotocopyPlacedAtMs(o) }))
  ].sort((a, b) => b.t - a.t);

  const countLabel = document.getElementById('adminReturnsCountLabel');
  if (countLabel) countLabel.textContent = 'Total returned orders: ' + merged.length;

  if (merged.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No returned orders.</div>`;
    return;
  }

  container.innerHTML = merged.map(({ kind, o }) => {
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
  const supabase = getSupabase();
  if (supabase) {
    await supabase.from('orders').delete().eq('id', orderId);
  }
  showToast('Order deleted.');
  await renderAdminOrders();
};

window.updateOrderStatus = async function (orderId, newStatus) {
  const supabase = getSupabase();
  if (supabase) await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
  await renderAdminOrders();
};

window.handleReturnAction = async function (orderId, table, action) {
  if (!confirm(`Are you sure you want to ${action === 'Return Accepted' ? 'Accept' : 'Reject'} this return?`)) return;
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from(table).update({ status: action }).eq('id', orderId);
    } catch (e) { console.error('Return action error:', e); }
  } else {
    try {
      let local = JSON.parse(localStorage.getItem(table) || '[]');
      local = local.map(o => o.id === orderId ? { ...o, status: action } : o);
      localStorage.setItem(table, JSON.stringify(local));
    } catch (e) { }
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

async function renderAdminDashboard() {
  const statBooks = document.getElementById('statBooks');
  if (statBooks) {
    if (products && products.length > 0) statBooks.innerText = products.length;
    else statBooks.innerText = "0";
  }

  const supabase = getSupabase();
  const statOrdersEl = document.getElementById('statOrders');
  if (supabase && statOrdersEl) {
    try {
      let total = 0;
      const r1 = await supabase.from('orders').select('id', { count: 'exact', head: true });
      if (!r1.error) total += r1.count ?? 0;
      const r2 = await supabase.from('photocopy_orders').select('id', { count: 'exact', head: true });
      if (!r2.error) total += r2.count ?? 0;
      statOrdersEl.innerText = String(total);
    } catch (e) {
      statOrdersEl.innerText = '0';
    }
  } else if (statOrdersEl) {
    statOrdersEl.innerText = '0';
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

  // Bind OTP
  window.requestOTP = requestOTP;

  try {
    await fetchProducts();
  } catch (e) { console.error("fetchProducts error", e); }

  if (document.getElementById('featuredProducts')) renderProductsGrid('featuredProducts', 4);

  if (document.getElementById('allProductsContainer')) {
    renderMultiSelect();
    renderProductsGrid('allProductsContainer', null, selectedCategories);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderProductsGrid('allProductsContainer', null, selectedCategories);
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
    const pricingForm = document.getElementById('pricingForm');
    if (pricingForm) {
      const currentRates = getCeRates();
      document.getElementById('bwRateInput').value = currentRates.bw;
      document.getElementById('colorRateInput').value = currentRates.color;
      pricingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const bw = parseFloat(document.getElementById('bwRateInput').value);
        const color = parseFloat(document.getElementById('colorRateInput').value);
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
    const product = products.find(p => p.id === productId);

    if (product) {
      window.buyNow = function (pid) { addToCart(pid); window.location.href = "checkout.html"; };
      const pDesc = product.desc || `Premium quality ${product.category.toLowerCase()} available for you at Shubham Xerox. Perfect for your exam preparation with clear printing and accurate content.`;

      // The inner HTML is identical to what the user had, minus the dynamic DB load loop which we do via JS functions.
      detailContainer.innerHTML = `
        <div class="product-detail-layout">
          <div class="product-detail-img-card">
            <img src="${product.img}" alt="${product.name}" style="width: 100%; border-radius: var(--radius-md); object-fit: cover;">
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
             if(parseInt(s.getAttribute('data-value')) <= val) {
                s.style.color = '#ffc107';
             } else {
                s.style.color = '#ccc';
             }
          });
        });
      });
      // Initial 5 star select
      if(stars.length > 4) stars[4].click();

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

  renderFreeNotesGrid(freeNotesData);
}

function renderFreeNotesGrid(notesToDisplay) {
  const container = document.getElementById('freeNotesContainer');
  if (!container) return;

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
    <div class="note-card" style="border: none; background: transparent; box-shadow: none; padding: 10px; display: flex; flex-direction: column; align-items: center;">
      <div class="note-icon" id="pdf-icon-${note.id}" style="width: 160px; height: 160px; margin: 0 auto 20px; background: ${bg}; border-radius: 50%; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; border: 4px solid var(--card-bg); box-shadow: var(--shadow-md); position: relative; overflow: hidden;">
        <div class="fallback-ui" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; transition: opacity 0.3s; z-index: 1;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          <span style="font-size: 0.85rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">FREE PDF</span>
        </div>
        <canvas id="pdf-canvas-${note.id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.5s; z-index: 2; pointer-events: none;"></canvas>
      </div>
      <div class="note-details" style="text-align: center; width: 100%;">
        <h3 class="note-title" style="font-size: 1.1rem; line-height: 1.4; margin-bottom: 4px;">${note.title}</h3>
        <p class="note-meta" style="margin-bottom: 16px;">${new Date(note.created_at).toLocaleDateString()}</p>
      </div>
      <a href="${note.file_url}" target="_blank" download class="btn note-download-btn" aria-label="Download ${note.title}" style="border-radius: var(--radius-full); width: auto; padding: 10px 20px; font-size: 0.95rem;">
        View & Download PDF <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      </a>
    </div>
  `}).join('');

  setTimeout(() => loadPdfThumbnails(notesToDisplay), 100);
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
        <div style="font-weight:600; color:var(--text-main); margin-bottom:4px;">${note.title}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);"><a href="${note.file_url}" target="_blank" style="color:var(--primary); text-decoration:underline;">View PDF</a> • Added: ${new Date(note.created_at).toLocaleDateString()}</div>
      </div>
      <button class="remove-btn" onclick="deleteFreeNote('${note.id}')" style="padding:8px 16px;">Delete</button>
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
    const btn = document.getElementById('btnUploadNote');
    const btnText = document.getElementById('btnUploadNoteText');

    if (!titleInput.value || !fileInput.files.length) return;

    btn.disabled = true;
    btnText.textContent = 'Uploading...';

    const supabase = getSupabase();
    if (supabase) {
      const file = fileInput.files[0];
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

      const { error: uploadError } = await supabase.storage.from('free-notes').upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        showToast("Storage Error: " + uploadError.message);
      } else {
        const { data: pubData } = supabase.storage.from('free-notes').getPublicUrl(fileName);

        const { error: dbError } = await supabase.from('free_notes').insert({
          title: titleInput.value,
          file_url: pubData.publicUrl
        });

        if (dbError) {
          showToast("DB Error: " + dbError.message);
        } else {
          showToast("Free Note published!");
          addFreeNoteForm.reset();
          loadAdminFreeNotes(); // Refresh list automatically
        }
      }
    }

    btn.disabled = false;
    btnText.textContent = 'Upload Note';
  });
}

window.deleteFreeNote = async function (id) {
  if (!confirm("Are you sure you want to delete this Note?")) return;
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('free_notes').delete().eq('id', id);
    if (error) showToast("Error deleting note.");
    else {
      showToast("Note deleted.");
      loadAdminFreeNotes();
    }
  }
}

// Hook them into DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (document.getElementById('freeNotesContainer')) {
      loadFreeNotes();
    }
    if (document.getElementById('adminFreeNotesList') && currentUser && currentUser.phone === ADMIN_PHONE) {
      loadAdminFreeNotes();
    }
  }, 1000); // Give supabase a second to boot up
});

// ==========================================
//  COST ESTIMATOR
// ==========================================
let ceState = {
  pages: 0,
  printType: 'bw',    // 'bw' | 'color'
  copies: 1,
  sides: 'single',    // 'single' | 'double'
  paperSize: 'a4',
  payment: 'COD',
  deliveryMode: 'delivery',
  totalCost: 0,
  fileName: ''
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
  ceState = { pages: 0, printType: 'bw', copies: 1, sides: 'single', paperSize: 'a4', payment: 'COD', totalCost: 0, fileName: '', pdfFile: null };
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
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  ceState.fileName = file.name;
  ceState.pdfFile = file; // store for upload on order

  const uploadZone = document.getElementById('ceUploadZone');
  const uploadText = document.getElementById('ceUploadText');
  const pageInfo = document.getElementById('cePageInfo');

  uploadText.textContent = 'Counting pages...';
  uploadZone.classList.add('has-file');

  try {
    if (!window.pdfjsLib) {
      // Fallback if pdf.js not loaded yet
      showToast('PDF reader loading, try again in a moment.');
      uploadText.textContent = file.name;
      return;
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    ceState.pages = pdfDoc.numPages;

    uploadText.textContent = `\u2705 ${file.name}`;
    document.getElementById('cePageCount').textContent = ceState.pages;
    document.getElementById('ceFileName').textContent = file.name.length > 28 ? file.name.substring(0, 28) + '\u2026' : file.name;
    pageInfo.style.display = 'flex';
    recalcEstimate();
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Could not read PDF. Try again.');
    uploadText.textContent = 'Click to upload PDF';
    uploadZone.classList.remove('has-file');
    ceState.pages = 0;
    ceState.fileName = '';
  }
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
    try { await scannerVideo.play(); } catch(e) { console.debug('Autoplay needed mute/interaction'); }
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
  
  // Auto crop 15% from left/right and 10% from top/bottom
  const mX = video.videoWidth * 0.15;
  const mY = video.videoHeight * 0.10;
  const cW = video.videoWidth * 0.70;
  const cH = video.videoHeight * 0.80;
  
  canvas.width = cW;
  canvas.height = cH;
  
  ctx.drawImage(video, mX, mY, cW, cH, 0, 0, canvas.width, canvas.height);
  
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
  ceState.pdfFile = new File([pdfBlob], "Scanned_Document.pdf", { type: "application/pdf" });
  ceState.pages = scannerImages.length;
  
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
    protoCost = protoCost * 0.6;
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
  if (supabase && ceState.pdfFile) {
    try {
      const safeName = ceState.pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      storagePath = `${orderId}_${safeName}`;
      const file = ceState.pdfFile;
      const { error: upErr } = await supabase.storage
        .from('photocopy-docs')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'application/pdf'
        });
      if (!upErr) {
        const { data: pubData } = supabase.storage.from('photocopy-docs').getPublicUrl(storagePath);
        docUrl = pubData.publicUrl;
      } else {
        console.warn('Doc upload failed:', upErr.message);
        showToast('PDF upload failed: ' + upErr.message + ' (order will save without file if DB allows)');
      }
    } catch (err) {
      console.error('Storage error:', err);
      showToast('PDF upload error — check Storage bucket "photocopy-docs" and policies.');
    }
  } else if (supabase && !ceState.pdfFile && ceState.pages) {
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
  const path = o.doc_path;
  const fallbackPublic = o.doc_url;
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

async function renderAdminPhotocopyOrders() {
  const container = document.getElementById('adminPhotocopyOrdersList');
  if (!container) return;

  container.innerHTML = `<div style="padding:24px; color:var(--text-muted); text-align:center;">Loading photocopy orders...</div>`;

  let orders = [];
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('photocopy_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) orders = data;
    } catch (e) { }
  }

  // Fallback local
  if (!orders.length) {
    try {
      orders = JSON.parse(localStorage.getItem('photocopy_orders') || '[]');
    } catch (e) { }
  }

  const copyCountEl = document.getElementById('adminPhotocopyCountLabel');
  if (copyCountEl) copyCountEl.textContent = 'Total photocopy orders: ' + orders.length;

  if (!orders.length) {
    container.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-muted);">No photocopy orders yet.</div>`;
    return;
  }

  const rows = await Promise.all(
    orders.map(async (raw) => {
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

  const supabase = getSupabase();
  if (supabase) {
    // 1. Delete PDF from storage (if exists)
    if (docPathEncoded) {
      try {
        const docPath = decodeURIComponent(docPathEncoded);
        await supabase.storage.from('photocopy-docs').remove([docPath]);
      } catch (e) { console.warn('Storage delete failed:', e); }
    }
    // 2. Delete DB record
    await supabase.from('photocopy_orders').delete().eq('id', orderId);
  } else {
    // Fallback: local storage
    try {
      let orders = JSON.parse(localStorage.getItem('photocopy_orders') || '[]');
      orders = orders.filter(o => o.id !== orderId);
      localStorage.setItem('photocopy_orders', JSON.stringify(orders));
    } catch (e) { }
  }
  showToast('Order and PDF deleted successfully.');
  await renderAdminPhotocopyOrders();
};

window.updatePhotocopyStatus = async function (orderId, newStatus) {
  const supabase = getSupabase();
  if (supabase) {
    await supabase.from('photocopy_orders').update({ status: newStatus }).eq('id', orderId);
  } else {
    // Update local
    try {
      let orders = JSON.parse(localStorage.getItem('photocopy_orders') || '[]');
      orders = orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
      localStorage.setItem('photocopy_orders', JSON.stringify(orders));
    } catch (e) { }
  }
  showToast('Status updated!');
};


