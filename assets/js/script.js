// Theme Initialization (Instant to prevent flash)
(function() {
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
  if (window.supabase) {
    try {
      _supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } catch(e) { console.error("Supabase init error:", e); }
  }
  return _supabaseInstance;
}

const defaultProducts = [
  { name: "MPPSC Prelims Unit 03: Geography of India", category: "AKAR IAS HINDI MEDIUM PRE", price: 176, img: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&q=80", desc: "Comprehensive notes covering the complete geography syllabus for MPPSC Prelims Unit 03." },
  { name: "Satyamev Jayate Institute - MPPSC Mains Short Notes", category: "Satyamev Jayate institute", price: 700, img: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80", desc: "Highly condensed and easy-to-revise short notes for MPPSC Mains by Satyamev Jayate Institute." },
  { name: "आधुनिक भारतीय इतिहास | Latest 2026", category: "NIRMAN IAS", price: 150, img: "https://images.unsplash.com/photo-1589998059171-988d887df646?auto=format&fit=crop&w=400&q=80", desc: "Modern Indian History textbook customized for 2026 exams in Hindi Medium." },
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
  } catch(e) {
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
  if(supabase) {
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
    } catch(e) { console.error(e); }
  }
  
  currentUser = newUser;
  localStorage.setItem('shubham_current_user', JSON.stringify(newUser));
  window.location.href = "index.html";
}

function logout() {
  localStorage.removeItem('shubham_current_user');
  window.location.href = "index.html";
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
  if (window.location.pathname.includes('cart.html')) renderCart();
}

function updateQuantity(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (item) {
    item.quantity += delta;
    if (item.quantity <= 0) removeFromCart(productId);
    else {
      saveCart();
      if (window.location.pathname.includes('cart.html')) renderCart();
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
    const overlay = document.getElementById('paymentOverlay');
    overlay.style.display = 'flex';
    setTimeout(async () => {
      document.getElementById('paymentStatus').textContent = "Payment Successful!";
      document.querySelector('.loader').style.display = 'none';
      setTimeout(() => completeOrder(orderData), 1500);
    }, 2000);
  } else {
    completeOrder(orderData);
  }
}

async function completeOrder(orderData) {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('orders').insert(orderData);
    } catch(e) {}
  }
  cart = [];
  saveCart();
  showToast("Order Placed Successfully!");
  setTimeout(() => window.location.href = "index.html", 2000);
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
window.toggleMultiSelect = function() {
  const dropdown = document.getElementById('multiSelectDropdown');
  if (dropdown) dropdown.classList.toggle('active');
};

window.filterMultiSelect = function() {
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

window.handleCategoryToggle = function(checkbox) {
  const val = checkbox.value;
  if (checkbox.checked) {
    if (!selectedCategories.includes(val)) selectedCategories.push(val);
  } else {
    selectedCategories = selectedCategories.filter(c => c !== val);
  }
  updateActiveCategoryTags();
  renderProductsGrid('allProductsContainer', null, selectedCategories);
};

window.resetCategories = function() {
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

window.uncheckCategory = function(cat) {
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

window.removeAdminCategory = function(cat) {
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
window.openEditModal = function(id) {
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

window.closeEditModal = function() {
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

  let dbOrders = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase.from('orders').select('*').order('date', { ascending: false });
    dbOrders = data || [];
  }

  if (dbOrders.length === 0) {
    container.innerHTML = `<div style="padding: 24px;">No orders yet.</div>`;
    return;
  }

  window.ordersListContext = dbOrders;
  container.innerHTML = dbOrders.map(o => {
    const statusClass = `status-${o.status.toLowerCase()}`;
    return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <strong style="font-size: 1.1rem;">${o.id}</strong><br>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${o.date}</span>
          </div>
          <div style="text-align: right;">
            <select class="status-select ${statusClass}" onchange="updateOrderStatus('${o.id}', this.value)">
              <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
              <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            </select>
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
          ${o.items.map(i => `<div style="font-size: 0.9rem; display:flex; justify-content:space-between;"><span>${i.name} (x${i.quantity})</span> <span>${formatPrice(i.price*i.quantity)}</span></div>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.updateOrderStatus = async function(orderId, newStatus) {
  const supabase = getSupabase();
  if (supabase) await supabase.from('orders').update({status: newStatus}).eq('id', orderId);
  await renderAdminOrders();
};

async function renderMyOrders() {
  const container = document.getElementById('myOrdersList');
  if (!container) return;

  if (!currentUser) {
     window.location.href = "login.html";
     return;
  }

  let dbOrders = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase.from('orders').select('*').eq('customerphone', currentUser.phone).order('date', { ascending: false });
    dbOrders = data || [];
  }

  if (dbOrders.length === 0) {
    container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted);">You have not placed any orders yet.</div>`;
    return;
  }

  container.innerHTML = dbOrders.map(o => {
    const statusClass = `status-${o.status.toLowerCase()}`;
    return `
      <div style="background: var(--card-bg); border: 1px solid var(--border-color); margin-bottom: 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); padding: 24px;">
        <div style="display:flex; justify-content:space-between; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
          <div>
            <strong style="font-size: 1.1rem;">${o.id}</strong><br>
            <span style="color: var(--text-muted); font-size: 0.9rem;">${o.date}</span>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;" class="${statusClass}">${o.status}</span>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div>
            <strong>Delivery Address</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-muted);">${o.address}</p>
          </div>
          <div>
            <strong>Payment Info</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-muted);">Method: ${o.method}</p>
            <p style="font-size: 0.9rem; font-weight: 700;">Total: ${formatPrice(o.total)}</p>
          </div>
        </div>

        <div style="background: var(--bg-color); border-radius: var(--radius-sm); padding: 12px;">
          <strong style="display:block; margin-bottom: 8px;">Order Items</strong>
          ${o.items.map(i => `<div style="font-size: 0.9rem; display:flex; justify-content:space-between; color: var(--text-main);"><span>${i.name} (x${i.quantity})</span> <span>${formatPrice(i.price*i.quantity)}</span></div>`).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderCheckoutSummary() {
  const container = document.getElementById('checkoutSummaryItems');
  if(!container) return;

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

async function renderAdminDashboard() {
  const statBooks = document.getElementById('statBooks');
  if (statBooks) {
    if (products && products.length > 0) statBooks.innerText = products.length;
    else statBooks.innerText = "0";
  }

  const supabase = getSupabase();
  if (supabase && document.getElementById('statOrders')) {
    supabase.from('orders').select('id', { count: 'exact' }).then(({data, count}) => {
      document.getElementById('statOrders').innerText = count !== null ? count : (data ? data.length : "0");
    });
  }

  const ctx = document.getElementById('visitsChart');
  if (ctx && window.Chart) {
    // Generate dates for the last 7 days
    const last7Days = [];
    const labels = [];
    for(let i=6; i>=0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
      labels.push(d.toLocaleDateString('en-US', {weekday: 'short'}));
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
    if(data) revs = data;
  }
  if (!revs || revs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">No reviews yet. Be the first to review!</p>';
    return;
  }
  container.innerHTML = revs.map(r => `
    <div style="background:var(--bg-color); padding:16px; border-radius:8px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <strong style="color:var(--primary);">${r.user_name}</strong>
        <span style="color:#ffc107;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
      </div>
      <p style="margin:0; font-size:0.95rem; color:#444;">${r.review_text}</p>
    </div>
  `).join('');
}


// --- Main Bootstrap ---
document.addEventListener('DOMContentLoaded', async () => {
  // --- Log Visit ---
  const todayDate = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('shubham_last_visit') !== todayDate) {
    const supabase = getSupabase();
    if (supabase) {
      supabase.from('site_visits').insert({}).then(({error}) => {
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

  // Attach priority listeners BEFORE blocking network fetches
  if (document.getElementById('loginForm')) document.getElementById('loginForm').addEventListener('submit', handleLogin);
  if (document.getElementById('registerForm')) document.getElementById('registerForm').addEventListener('submit', handleRegister);

  if (document.getElementById('checkoutForm')) {
    if(!currentUser) { showToast("Please login first."); setTimeout(()=> window.location.href="login.html", 1500); }
    renderCheckoutSummary();
    if(currentUser) { document.getElementById('fullName').value = currentUser.name || ""; }
    document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);
  }

  // Bind OTP
  window.requestOTP = requestOTP;

  try {
    await fetchProducts();
  } catch(e) { console.error("fetchProducts error", e); }

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
      window.buyNow = function(pid) { addToCart(pid); window.location.href = "checkout.html"; };
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
                  <label for="rating" style="font-weight: 600; margin-bottom: 8px; display: block; color: var(--text-main);">Rating (1-5 stars):</label>
                  <input type="number" id="rating" min="1" max="5" required style="padding: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); border-radius: 4px; width: 100px;">
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

       document.getElementById('reviewForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!currentUser) { showToast("Login required to review"); setTimeout(()=> window.location.href="login.html", 1500); return; }
        const rVal = document.getElementById('rating').value;
        const tVal = document.getElementById('reviewText').value;
        const supabase = getSupabase();
        if(supabase) {
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
  if(supabase) {
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
  if(!container) return;
  
  const supabase = getSupabase();
  if(!supabase) return;
  
  // Fetch messages to get unique users who have chatted
  const { data: messages } = await supabase.from('messages').select('sender, receiver, created_at').order('created_at', {ascending: false});
  if(!messages) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No messages yet.</div>';
    return;
  }
  
  const userPhones = new Set();
  messages.forEach(m => {
    if(m.sender !== ADMIN_PHONE) userPhones.add(m.sender);
    if(m.receiver !== ADMIN_PHONE) userPhones.add(m.receiver);
  });
  
  if(userPhones.size === 0) {
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
    if(!orderCount[o.customerphone]) orderCount[o.customerphone] = 0;
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
   if(!supabase) return "User";
   const { data } = await supabase.from('users').select('name').eq('phone', phone).single();
   return data ? data.name : "User";
}

// Shared Message Loading & Rendering
async function loadMessages(chatPhoneId, containerId, isAdminPanel = false) {
  const supabase = getSupabase();
  if(!supabase) return;
  
  const { data: messages } = await supabase.from('messages')
    .select('*')
    .or(`and(sender.eq.${chatPhoneId},receiver.eq.${ADMIN_PHONE}),and(sender.eq.${ADMIN_PHONE},receiver.eq.${chatPhoneId})`)
    .eq('is_deleted', false)
    .order('created_at', {ascending: true});

  const container = document.getElementById(containerId);
  if(!container) return;
  
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
  if(!supabase) return;
  
  if(chatSubscription) supabase.removeChannel(chatSubscription);
  
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
  if(!container) return;
  
  if (msg.id && document.getElementById(`msg-${msg.id}`)) return;
  const emptyState = container.querySelector('.chat-empty-state');
  if(emptyState) emptyState.style.display = 'none';

  const placeholderInfo = container.querySelector('.chat-placeholder-empty');
  if(placeholderInfo) placeholderInfo.remove();

  const isMe = isAdminPanel ? (msg.sender === ADMIN_PHONE) : (msg.sender !== ADMIN_PHONE);
  const bubbleClass = isMe ? 'chat-bubble-me' : 'chat-bubble-other';
  
  // Safe date parsing 
  const d = new Date(msg.created_at);
  const timeInfo = isNaN(d) ? 'Now' : d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
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
  
  if(!textInput) return; // defensive

  const msgText = textInput.value.trim();
  const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  
  if (!msgText && !file) return; // Nothing to send
  
  const senderId = isUser ? currentUser.phone : ADMIN_PHONE;
  const receiverId = isUser ? ADMIN_PHONE : currentChatUserId;
  
  // Disable parsing while sending
  textInput.disabled = true;
  if(fileInput) fileInput.disabled = true;
  
  let uploadedFileUrl = null;
  
  if (file) {
    uploadedFileUrl = await uploadPdfToSupabase(file);
    if (!uploadedFileUrl) {
      showToast("File upload failed.");
      textInput.disabled = false;
      if(fileInput) fileInput.disabled = false;
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
        if(insertedMsg) {
          appendMessageToUI(insertedMsg, containerId, !isUser);
        }
    }
  }
  
  // Cleanup
  textInput.value = '';
  textInput.disabled = false;
  if(fileInput) {
      fileInput.value = '';
      fileInput.disabled = false;
  }
  if(previewClearFunc) previewClearFunc();
  textInput.focus();
}

async function uploadPdfToSupabase(file) {
  const supabase = getSupabase();
  if(!supabase) return null;
  
  const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const { data, error } = await supabase.storage.from('chat-files').upload(fileName, file, { cacheControl: '3600', upsert: false });
  
  if(error) {
    console.error("Storage upload error:", error);
    showToast("Storage Error: " + error.message);
    return null;
  }
  
  const { data: pubData } = supabase.storage.from('chat-files').getPublicUrl(fileName);
  return pubData.publicUrl;
}

// Delete Chat (Admin)
async function deleteEntireChat(phone) {
  if(!confirm("Are you sure you want to delete all messages for this user? This cannot be undone.")) return;
  const supabase = getSupabase();
  if(supabase) {
    // Soft delete
    await supabase.from('messages')
       .update({is_deleted: true})
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
  if(!container) return; // not index page

  const supabase = getSupabase();
  if(!supabase) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Database connection failed.</div>';
    return;
  }

  const { data: notes } = await supabase.from('free_notes').select('*').order('created_at', { ascending: false });
  freeNotesData = notes || [];
  
  renderFreeNotesGrid(freeNotesData);
}

function renderFreeNotesGrid(notesToDisplay) {
  const container = document.getElementById('freeNotesContainer');
  if(!container) return;

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
    } catch(err) {
      console.warn("Failed to load PDF thumbnail for note:", note.id, err);
    }
  }
}

window.filterFreeNotes = function() {
  const q = document.getElementById('freeNotesSearch').value.toLowerCase();
  const filtered = freeNotesData.filter(note => note.title.toLowerCase().includes(q));
  renderFreeNotesGrid(filtered);
};

// Admin Page logic
async function loadAdminFreeNotes() {
  const container = document.getElementById('adminFreeNotesList');
  if(!container) return;

  const supabase = getSupabase();
  if(!supabase) return;

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

    if(!titleInput.value || !fileInput.files.length) return;

    btn.disabled = true;
    btnText.textContent = 'Uploading...';

    const supabase = getSupabase();
    if(supabase) {
      const file = fileInput.files[0];
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      
      const { error: uploadError } = await supabase.storage.from('free-notes').upload(fileName, file, { cacheControl: '3600', upsert: false });
      
      if(uploadError) {
        showToast("Storage Error: " + uploadError.message);
      } else {
        const { data: pubData } = supabase.storage.from('free-notes').getPublicUrl(fileName);
        
        const { error: dbError } = await supabase.from('free_notes').insert({
          title: titleInput.value,
          file_url: pubData.publicUrl
        });

        if(dbError) {
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

window.deleteFreeNote = async function(id) {
  if(!confirm("Are you sure you want to delete this Note?")) return;
  const supabase = getSupabase();
  if(supabase) {
    const {error} = await supabase.from('free_notes').delete().eq('id', id);
    if(error) showToast("Error deleting note.");
    else {
      showToast("Note deleted.");
      loadAdminFreeNotes();
    }
  }
}

// Hook them into DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if(document.getElementById('freeNotesContainer')) {
      loadFreeNotes();
    }
    if(document.getElementById('adminFreeNotesList') && currentUser && currentUser.phone === ADMIN_PHONE) {
      loadAdminFreeNotes();
    }
  }, 1000); // Give supabase a second to boot up
});
